import { prisma } from "../prisma.js";

export type GasOperationRecord = Readonly<{
  operationId: string;
  walletAddress: string;
  transactionHash: string;
  requestId: string | null;
  status: string;
  outerTransactionHash: string | null;
  reservedStroops: string | null;
  actualFeeStroops: string | null;
  expiresAt: Date | null;
  reconciliationRequired: boolean;
  errorCode: string | null;
}>;

export type NewGasOperation = Readonly<{
  operationId: string;
  walletAddress: string;
  transactionHash: string;
}>;

export type GasOperationPatch = Partial<
  Pick<
    GasOperationRecord,
    | "requestId"
    | "status"
    | "outerTransactionHash"
    | "reservedStroops"
    | "actualFeeStroops"
    | "expiresAt"
    | "reconciliationRequired"
    | "errorCode"
  >
>;

export interface GasOperationStore {
  create(input: NewGasOperation): Promise<GasOperationRecord>;
  find(operationId: string): Promise<GasOperationRecord | null>;
  update(operationId: string, patch: GasOperationPatch): Promise<GasOperationRecord>;
}

export class PrismaGasOperationStore implements GasOperationStore {
  constructor(private readonly client: typeof prisma = prisma) {}

  create(input: NewGasOperation) {
    return this.client.gasOperation.create({
      data: {
        operationId: input.operationId,
        walletAddress: input.walletAddress,
        transactionHash: input.transactionHash,
        status: "claimed",
      },
    });
  }

  find(operationId: string) {
    return this.client.gasOperation.findUnique({ where: { operationId } });
  }

  update(operationId: string, patch: GasOperationPatch) {
    return this.client.gasOperation.update({ where: { operationId }, data: patch });
  }
}

export function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
