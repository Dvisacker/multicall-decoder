import {
  decodeFunctionData,
  parseAbi,
  parseAbiItem,
  type Abi,
  type Hex,
} from 'viem';
import { SignatureDecoder } from './signature-decoder';
import { EtherscanClient } from './etherscan-client';
import type { MulticallCall, DecodedCall, DecoderOptions } from './types';

/**
 * Main decoder for multicall transaction data
 */
export class MulticallDecoder {
  private signatureDecoder: SignatureDecoder;
  private etherscanClient: EtherscanClient;
  private verbose: boolean;

  constructor(options: DecoderOptions = {}) {
    this.signatureDecoder = new SignatureDecoder();
    this.etherscanClient = new EtherscanClient({
      apiKey: options.etherscanApiKey,
      network: options.network,
    });
    this.verbose = options.verbose || false;
  }

  /**
   * Parse multicall data into individual calls
   * Supports common multicall formats (Multicall2, Multicall3)
   */
  parseMulticallData(data: string): MulticallCall[] {
    const calls: MulticallCall[] = [];

    try {
      // Try to decode as Multicall3 aggregate3 format
      // aggregate3((address,bool,bytes)[])
      const multicall3Abi = parseAbi([
        'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) external payable returns ((bool success, bytes returnData)[] returnData)',
      ]);

      try {
        const decoded = decodeFunctionData({
          abi: multicall3Abi,
          data: data as Hex,
        });

        if (decoded.functionName === 'aggregate3' && decoded.args && Array.isArray(decoded.args[0])) {
          for (const call of decoded.args[0] as any[]) {
            calls.push({
              target: call.target,
              callData: call.callData,
            });
          }
          return calls;
        }
      } catch (e) {
        // Not Multicall3 format, continue
      }

      // Try to decode as Multicall2 aggregate format
      // aggregate((address,bytes)[])
      const multicall2Abi = parseAbi([
        'function aggregate((address target, bytes callData)[] calls) external returns (uint256 blockNumber, bytes[] returnData)',
      ]);

      try {
        const decoded = decodeFunctionData({
          abi: multicall2Abi,
          data: data as Hex,
        });

        if (decoded.functionName === 'aggregate' && decoded.args && Array.isArray(decoded.args[0])) {
          for (const call of decoded.args[0] as any[]) {
            calls.push({
              target: call.target,
              callData: call.callData,
            });
          }
          return calls;
        }
      } catch (e) {
        // Not Multicall2 format
      }

      // Try tryAggregate format
      const tryAggregateAbi = parseAbi([
        'function tryAggregate(bool requireSuccess, (address target, bytes callData)[] calls) external returns ((bool success, bytes returnData)[] returnData)',
      ]);

      try {
        const decoded = decodeFunctionData({
          abi: tryAggregateAbi,
          data: data as Hex,
        });

        if (decoded.functionName === 'tryAggregate' && decoded.args && Array.isArray(decoded.args[1])) {
          for (const call of decoded.args[1] as any[]) {
            calls.push({
              target: call.target,
              callData: call.callData,
            });
          }
          return calls;
        }
      } catch (e) {
        // Not tryAggregate format
      }

      // Try tryBlockAndAggregate format
      const tryBlockAbi = parseAbi([
        'function tryBlockAndAggregate(bool requireSuccess, (address target, bytes callData)[] calls) external returns (uint256 blockNumber, bytes32 blockHash, (bool success, bytes returnData)[] returnData)',
      ]);

      try {
        const decoded = decodeFunctionData({
          abi: tryBlockAbi,
          data: data as Hex,
        });

        if (decoded.functionName === 'tryBlockAndAggregate' && decoded.args && Array.isArray(decoded.args[1])) {
          for (const call of decoded.args[1] as any[]) {
            calls.push({
              target: call.target,
              callData: call.callData,
            });
          }
          return calls;
        }
      } catch (e) {
        // Not tryBlockAndAggregate format
      }

      throw new Error('Unable to parse multicall data - unknown format');
    } catch (error) {
      if (this.verbose) {
        console.error('Error parsing multicall data:', error);
      }
      throw error;
    }
  }

  /**
   * Decode a single call data
   */
  async decodeCall(target: string, callData: string): Promise<DecodedCall> {
    const selector = callData.slice(0, 10);

    // First, try to get ABI from Etherscan
    const abi = await this.etherscanClient.getContractAbi(target);

    if (abi) {
      try {
        const decoded = decodeFunctionData({
          abi,
          data: callData as Hex,
        });

        const functionFragment = abi.find(
          (item: any) => item.type === 'function' && item.name === decoded.functionName
        ) as any;

        let signature = decoded.functionName;
        if (functionFragment && functionFragment.inputs) {
          const inputTypes = functionFragment.inputs.map((input: any) => input.type).join(',');
          signature = `${decoded.functionName}(${inputTypes})`;
        }

        return {
          target,
          functionName: decoded.functionName,
          functionSignature: signature,
          args: decoded.args as any[],
          rawCallData: callData,
        };
      } catch (error) {
        // Fall through to 4byte directory
      }
    }

    // Fallback to 4byte directory
    const signatures = await this.signatureDecoder.lookupSelector(selector);

    if (signatures.length === 0) {
      return {
        target,
        functionName: 'unknown',
        functionSignature: selector,
        args: [callData.slice(10)], // Return raw data without selector
        rawCallData: callData,
      };
    }

    // Try each signature until one works
    for (const sig of signatures) {
      try {
        // Use parseAbiItem for dynamic signatures
        const abiItem = parseAbiItem(`function ${sig.signature}`);
        const decoded = decodeFunctionData({
          abi: [abiItem],
          data: callData as Hex,
        });

        return {
          target,
          functionName: sig.name,
          functionSignature: sig.signature,
          args: (decoded.args || []) as any[],
          rawCallData: callData,
        };
      } catch (error) {
        // Try next signature
        continue;
      }
    }

    // If all signatures fail, return the first one with raw data
    return {
      target,
      functionName: signatures[0].name,
      functionSignature: signatures[0].signature,
      args: [callData.slice(10)],
      rawCallData: callData,
    };
  }

  /**
   * Decode all calls in multicall data
   */
  async decodeMulticall(data: string): Promise<DecodedCall[]> {
    const calls = this.parseMulticallData(data);

    const decodedCalls: DecodedCall[] = [];

    for (const call of calls) {
      const decoded = await this.decodeCall(call.target, call.callData);
      decodedCalls.push(decoded);
    }

    return decodedCalls;
  }
}
