import express from "express";
import cors from "cors";

import { getAccountNonce, createSmartAccountClient } from "permissionless";
import {
  UserOperation,
  bundlerActions,
  getSenderAddress,
  getUserOperationHash,
  waitForUserOperationReceipt,
  GetUserOperationReceiptReturnType,
  signUserOperationHashWithECDSA,
} from "permissionless";
import {
  pimlicoBundlerActions,
  pimlicoPaymasterActions,
} from "permissionless/actions/pimlico";
import {
  Address,
  Hash,
  concat,
  createClient,
  createPublicClient,
  encodeFunctionData,
  http,
  Hex,
} from "viem";
import {
  generatePrivateKey,
  privateKeyToAccount,
  signMessage,
} from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { createPimlicoPaymasterClient } from "permissionless/clients/pimlico";
import { privateKeyToBiconomySmartAccount } from "permissionless/accounts";
import { scrypt, toUtf8Bytes, id } from "ethers";
import { Web3 } from "web3";

const privateKeyFromSignature = async (signature: string): Promise<string> => {
  const signatureBuffer = toUtf8Bytes(signature);
  const salt = id("passkey");
  return scrypt(signatureBuffer, salt, 1024, 8, 1, 32);
};

const PORT = 443;
const API_KEY = "a1dc6007-223a-4485-b4d0-c0ee32a3ff62";
const PAYMASTER_URL = `https://api.pimlico.io/v2/avalanche-fuji/rpc?apikey=${API_KEY}`;
const BUNDLER_URL = `https://api.pimlico.io/v1/avalanche-fuji/rpc?apikey=${API_KEY}`;
const ENTRY_POINT = "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789";
const TESTNET_URL = "https://rpc.ankr.com/avalanche_fuji";

const publicClient = createPublicClient({
  transport: http(TESTNET_URL),
});
const paymasterClient = createPimlicoPaymasterClient({
  transport: http(PAYMASTER_URL),
});

// const txHash = await smartAccountClient.sendTransaction({
//   to: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
//   value: 0n,
//   data: "0x1234",
//   maxFeePerGas: gasPrices.fast.maxFeePerGas,
//   maxPriorityFeePerGas: gasPrices.fast.maxPriorityFeePerGas,
// });

// console.log(
//   `User operation included: https://43113.testnet.snowtrace.io/tx/${txHash}`,
// );

const app = express();
app.use(cors());
app.use(express.json());

interface GetAddressRequest {
  signature: string;
}
app.post("/get-address", async (req, res) => {
  const { signature } = req.body as GetAddressRequest;
  if (!signature) {
    res.status(400).json({ error: "Signature is required" });
    return;
  }
  const privateKey = await privateKeyFromSignature(signature);
  const account = await privateKeyToBiconomySmartAccount(publicClient, {
    privateKey: privateKey as Hex,
    entryPoint: ENTRY_POINT,
  });
  console.log(
    `Smart account address: https://43113.testnet.snowtrace.io/address/${account.address}`,
  );
  res.json({ address: account.address });
});

interface SendTxRequest {
  signature: string;
  to: string;
  value: number;
  data: string;
}
app.post("/send-tx", async (req, res) => {
  const { signature, to, value, data } = req.body as SendTxRequest;
  const privateKey = await privateKeyFromSignature(signature);
  const account = await privateKeyToBiconomySmartAccount(publicClient, {
    privateKey: privateKey as Hex,
    entryPoint: ENTRY_POINT,
  });
  console.log(
    `Smart account address: https://43113.testnet.snowtrace.io/address/${account.address}`,
  );
  const smartAccountClient = createSmartAccountClient({
    account,
    chain: avalancheFuji,
    transport: http(BUNDLER_URL),
    sponsorUserOperation: paymasterClient.sponsorUserOperation,
  })
    .extend(bundlerActions)
    .extend(pimlicoBundlerActions);
  const gasPrices = await smartAccountClient.getUserOperationGasPrice();
  console.log("Received gas prices:", gasPrices);
  const txHash = await smartAccountClient.sendTransaction({
    to: to as Address,
    value: BigInt(value),
    data: data as Hex,
    maxFeePerGas: gasPrices.fast.maxFeePerGas,
    maxPriorityFeePerGas: gasPrices.fast.maxPriorityFeePerGas,
  });
  console.log(
    `User operation included: https://43113.testnet.snowtrace.io/tx/${txHash}`,
  );
  res.json({ txHash });
});

app.get("/get-balance", async (req, res) => {
  const address = req.query.address as string;
  const web3 = new Web3(new Web3.providers.HttpProvider(TESTNET_URL));
  const balance = await web3.eth.getBalance(address);
  res.json({ balance: Number(balance) });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
