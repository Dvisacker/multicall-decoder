export interface MulticallCall {
  target: string;
  callData: string;
}

export interface DecodedCall {
  target: string;
  functionName: string;
  functionSignature: string;
  args: any[];
  rawCallData: string;
}

export interface DecoderOptions {
  etherscanApiKey?: string;
  network?: 'mainnet' | 'goerli' | 'sepolia' | 'polygon' | 'arbitrum' | 'optimism' | 'base';
  verbose?: boolean;
}
