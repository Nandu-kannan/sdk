import Database from "better-sqlite3";
import * as StellarSdk from "@stellar/stellar-sdk";
import { SoroSaveClient } from "../client";
import { SoroSaveConfig } from "../types";

const db = new Database("sorosave.db");

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY,
    name TEXT,
    admin TEXT,
    token TEXT,
    contribution_amount TEXT,
    cycle_length INTEGER,
    max_members INTEGER,
    current_round INTEGER,
    total_rounds INTEGER,
    status TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS members (
    group_id INTEGER,
    address TEXT,
    PRIMARY KEY (group_id, address),
    FOREIGN KEY (group_id) REFERENCES groups(id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    ledger INTEGER,
    contract_id TEXT,
    type TEXT,
    data TEXT,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS last_ledger (
    id INTEGER PRIMARY KEY,
    ledger INTEGER
  );
`);

const insertGroup = db.prepare(`
  INSERT OR REPLACE INTO groups 
  (id, name, admin, token, contribution_amount, cycle_length, max_members, current_round, total_rounds, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMember = db.prepare(`
  INSERT OR IGNORE INTO members (group_id, address) VALUES (?, ?)
`);

const insertEvent = db.prepare(`
  INSERT OR IGNORE INTO events (id, ledger, contract_id, type, data, timestamp)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const updateLastLedger = db.prepare(`
  INSERT OR REPLACE INTO last_ledger (id, ledger) VALUES (1, ?)
`);

const getLastLedger = () => {
  const row = db.prepare("SELECT ledger FROM last_ledger WHERE id = 1").get() as { ledger: number } | undefined;
  return row ? row.ledger : 0;
};

export async function indexEvents(config: SoroSaveConfig) {
  const server = new StellarSdk.rpc.Server(config.rpcUrl);
  const client = new SoroSaveClient(config);
  
  let startLedger = getLastLedger();
  
  console.log(`Starting indexer from ledger ${startLedger}...`);

  setInterval(async () => {
    try {
      const response = await server.getEvents({
        startLedger: startLedger,
        filters: [
          {
            type: "contract",
            contractIds: [config.contractId],
          },
        ],
        limit: 100,
      });

      for (const event of response.events) {
        console.log(`Processing event ${event.id}...`);
        
        // Parse event type and data
        const topic = StellarSdk.scValToNative(event.topic[0]);
        const data = StellarSdk.scValToNative(event.value);

        insertEvent.run(
          event.id,
          event.ledger,
          event.contractId,
          topic,
          JSON.stringify(data),
          Date.now()
        );

        // Update local DB state based on event
        if (topic === "group_created") {
          const groupId = Number(data.id);
          const groupDetails = await client.getGroup(groupId);
          insertGroup.run(
            groupDetails.id,
            groupDetails.name,
            groupDetails.admin,
            groupDetails.token,
            groupDetails.contributionAmount.toString(),
            groupDetails.cycleLength,
            groupDetails.maxMembers,
            groupDetails.currentRound,
            groupDetails.totalRounds,
            groupDetails.status,
            groupDetails.createdAt
          );
          for (const member of groupDetails.members) {
            insertMember.run(groupId, member);
          }
        } else if (topic === "member_joined") {
          const groupId = Number(data.group_id);
          const member = data.member;
          insertMember.run(groupId, member);
        }
        // Add more event handlers as needed...

        startLedger = Math.max(startLedger, event.ledger);
        updateLastLedger.run(startLedger);
      }
    } catch (error) {
      console.error("Indexer error:", error);
    }
  }, 5000);
}
