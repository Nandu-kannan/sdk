import { ApolloServer, gql } from "apollo-server";
import Database from "better-sqlite3";
import { SoroSaveClient } from "../client";
import { SoroSaveConfig } from "../types";

const db = new Database("sorosave.db");

const typeDefs = gql`
  type Group {
    id: Int!
    name: String!
    admin: String!
    token: String!
    contributionAmount: String!
    cycleLength: Int!
    maxMembers: Int!
    currentRound: Int!
    totalRounds: Int!
    status: String!
    createdAt: Int!
    members: [String!]!
  }

  type Event {
    id: String!
    ledger: Int!
    type: String!
    data: String!
    timestamp: Int!
  }

  type Query {
    groups: [Group!]!
    group(id: Int!): Group
    events(type: String): [Event!]!
    memberGroups(address: String!): [Group!]!
  }
`;

export async function startApi(config: SoroSaveConfig) {
  const client = new SoroSaveClient(config);

  const resolvers = {
    Query: {
      groups: () => {
        return db.prepare("SELECT * FROM groups").all().map((g: any) => ({
          ...g,
          contributionAmount: g.contribution_amount,
          cycleLength: g.cycle_length,
          maxMembers: g.max_members,
          currentRound: g.current_round,
          totalRounds: g.total_rounds,
          createdAt: g.created_at,
          members: db.prepare("SELECT address FROM members WHERE group_id = ?").all(g.id).map((m: any) => m.address)
        }));
      },
      group: (_: any, { id }: { id: number }) => {
        const g = db.prepare("SELECT * FROM groups WHERE id = ?").get(id) as any;
        if (!g) return null;
        return {
          ...g,
          contributionAmount: g.contribution_amount,
          cycleLength: g.cycle_length,
          maxMembers: g.max_members,
          currentRound: g.current_round,
          totalRounds: g.total_rounds,
          createdAt: g.created_at,
          members: db.prepare("SELECT address FROM members WHERE group_id = ?").all(g.id).map((m: any) => m.address)
        };
      },
      events: (_: any, { type }: { type?: string }) => {
        if (type) {
          return db.prepare("SELECT * FROM events WHERE type = ?").all(type);
        }
        return db.prepare("SELECT * FROM events").all();
      },
      memberGroups: (_: any, { address }: { address: string }) => {
        const groupIds = db.prepare("SELECT group_id FROM members WHERE address = ?").all(address).map((m: any) => m.group_id);
        if (groupIds.length === 0) return [];
        return db.prepare(`SELECT * FROM groups WHERE id IN (${groupIds.join(",")})`).all().map((g: any) => ({
          ...g,
          contributionAmount: g.contribution_amount,
          cycleLength: g.cycle_length,
          maxMembers: g.max_members,
          currentRound: g.current_round,
          totalRounds: g.total_rounds,
          createdAt: g.created_at,
          members: db.prepare("SELECT address FROM members WHERE group_id = ?").all(g.id).map((m: any) => m.address)
        }));
      },
    },
  };

  const server = new ApolloServer({ typeDefs, resolvers });

  const { url } = await server.listen({ port: 4000 });
  console.log(`🚀 GraphQL API ready at ${url}`);
}
