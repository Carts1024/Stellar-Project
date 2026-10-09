import {
  Address,
  FeeBumpTransaction,
  Keypair,
  Networks,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

export const MAX_SIGNED_XDR_CHARS = 64 * 1024;

export type VerifiedGasTransaction = Readonly<{
  walletAddress: string;
  transactionHash: string;
  contractId: string;
}>;

export class GasRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly code = "invalid_gas_request",
  ) {
    super(message);
    this.name = "GasRequestError";
  }
}

export function verifyGasSignedTransaction(
  transactionXdr: string,
  allowedContractIds: readonly string[],
): VerifiedGasTransaction {
  if (
    typeof transactionXdr !== "string" ||
    transactionXdr.length === 0 ||
    transactionXdr.length > MAX_SIGNED_XDR_CHARS ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(transactionXdr)
  ) {
    throw new GasRequestError("A bounded base64 transaction XDR is required.");
  }

  let transaction: ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    transaction = TransactionBuilder.fromXDR(transactionXdr, Networks.TESTNET);
  } catch {
    throw new GasRequestError("The signed transaction XDR is invalid for Stellar Testnet.");
  }

  if (transaction instanceof FeeBumpTransaction) {
    throw new GasRequestError("Gas Station accepts the user's signed inner transaction, not a FeeBump transaction.");
  }

  if (transaction.operations.length !== 1 || transaction.operations[0]?.type !== "invokeHostFunction") {
    throw new GasRequestError("Gas Station accepts exactly one Soroban invokeHostFunction operation.");
  }

  const walletAddress = transaction.source;
  if (!StrKey.isValidEd25519PublicKey(walletAddress)) {
    throw new GasRequestError("The transaction source must be a Stellar account address.");
  }

  const walletKeypair = Keypair.fromPublicKey(walletAddress);
  const sourceSignaturePresent = transaction.signatures.some((decoratedSignature) => {
    try {
      return walletKeypair.verify(transaction.hash(), decoratedSignature.signature());
    } catch {
      return false;
    }
  });

  if (!sourceSignaturePresent) {
    throw new GasRequestError(
      "The connected wallet must sign the transaction before Gas Station submission.",
      401,
      "wallet_signature_required",
    );
  }

  const xdrOperation = transaction.toEnvelope().v1().tx().operations()[0];
  const invokeHostFunction = xdrOperation?.body().invokeHostFunctionOp();
  const hostFunction = invokeHostFunction?.hostFunction();
  if (!hostFunction || hostFunction.switch().name !== "hostFunctionTypeInvokeContract") {
    throw new GasRequestError("Only a Soroban contract invocation is eligible for this application.");
  }

  const contractId = Address.fromScAddress(hostFunction.invokeContract().contractAddress()).toString();
  if (!allowedContractIds.includes(contractId)) {
    throw new GasRequestError("The transaction targets a contract outside this project.", 403, "project_contract_not_allowed");
  }

  return {
    walletAddress,
    transactionHash: transaction.hash().toString("hex"),
    contractId,
  };
}
