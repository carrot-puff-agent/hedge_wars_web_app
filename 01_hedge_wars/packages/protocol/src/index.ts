import { z } from 'zod';

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 16_384;

export const ClientMessage = z.object({
  type: z.literal('client.hello'),
  protocolVersion: z.number().int().nonnegative(),
  gameId: z.literal('hedge-wars'),
}).strict();

export const ServerMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('server.hello'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    gameId: z.literal('hedge-wars'),
    serverVersion: z.string(),
    capabilities: z.array(z.string()),
  }).strict(),
  z.object({
    type: z.literal('server.error'),
    code: z.enum(['INVALID_MESSAGE', 'PROTOCOL_MISMATCH']),
  }).strict(),
]);

export type ServerMessage = z.infer<typeof ServerMessage>;
export type ClientMessage = z.infer<typeof ClientMessage>;
