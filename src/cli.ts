#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import { MulticallDecoder } from './decoder';
import { EtherscanClient } from './etherscan-client';
import { Explainer } from './explainer';
import type { DecoderOptions } from './types';

const program = new Command();

program
  .name('multicall-decoder')
  .description('Decode multicall transaction data using 4byte directory and Etherscan API')
  .version('1.0.0');

program
  .command('decode')
  .description('Decode multicall transaction data')
  .argument('<data>', 'Multicall transaction data (hex string)')
  .option('-k, --api-key <key>', 'Etherscan API key (or set ETHERSCAN_API_KEY env var)')
  .option(
    '-n, --network <network>',
    'Network to use (mainnet, goerli, sepolia, polygon, arbitrum, optimism, base)',
    'mainnet'
  )
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-j, --json', 'Output as JSON', false)
  .option('-e, --explain', 'Explain the decoded calls using Claude CLI', false)
  .action(async (data: string, options: any) => {
    try {
      const decoderOptions: DecoderOptions = {
        etherscanApiKey: options.apiKey,
        network: options.network,
        verbose: options.verbose,
      };

      const decoder = new MulticallDecoder(decoderOptions);

      if (options.verbose) {
        console.log(chalk.blue('Starting multicall decoding...\n'));
      }

      const decodedCalls = await decoder.decodeMulticall(data);

      // Fetch contract names for display
      const etherscanClient = new EtherscanClient({
        apiKey: options.apiKey,
        network: options.network,
      });

      const contractInfoMap = new Map();
      const uniqueAddresses = [...new Set(decodedCalls.map(call => call.target.toLowerCase()))];

      for (const address of uniqueAddresses) {
        const contractInfo = await etherscanClient.getContractInfo(address);
        contractInfoMap.set(address, contractInfo);
      }

      if (options.json) {
        console.log(JSON.stringify(decodedCalls, null, 2));
      } else {
        printDecodedCalls(decodedCalls, contractInfoMap);
      }

      // If explain flag is set, get explanation from Claude
      if (options.explain) {
        console.log(chalk.blue('\n' + '='.repeat(60)));
        console.log(chalk.bold.blue('AI Explanation'));
        console.log(chalk.blue('='.repeat(60) + '\n'));

        const explainer = new Explainer();

        // Check if Claude CLI is available
        const claudeAvailable = await explainer.isClaudeAvailable();
        if (!claudeAvailable) {
          console.error(chalk.red('Error: Claude CLI is not available.'));
          console.error(chalk.yellow('Please install the claude CLI to use the --explain flag.'));
          process.exit(1);
        }

        // Get explanation
        const explanation = await explainer.explainMulticall(decodedCalls, contractInfoMap);
        console.log(explanation);
        console.log();
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('decode-call')
  .description('Decode a single contract call')
  .argument('<target>', 'Target contract address')
  .argument('<data>', 'Call data (hex string)')
  .option('-k, --api-key <key>', 'Etherscan API key (or set ETHERSCAN_API_KEY env var)')
  .option(
    '-n, --network <network>',
    'Network to use (mainnet, goerli, sepolia, polygon, arbitrum, optimism, base)',
    'mainnet'
  )
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-j, --json', 'Output as JSON', false)
  .option('-e, --explain', 'Explain the decoded call using Claude CLI', false)
  .action(async (target: string, data: string, options: any) => {
    try {
      const decoderOptions: DecoderOptions = {
        etherscanApiKey: options.apiKey,
        network: options.network,
        verbose: options.verbose,
      };

      const decoder = new MulticallDecoder(decoderOptions);

      if (options.verbose) {
        console.log(chalk.blue('Decoding call...\n'));
      }

      const decodedCall = await decoder.decodeCall(target, data);

      // Fetch contract info
      const etherscanClient = new EtherscanClient({
        apiKey: options.apiKey,
        network: options.network,
      });

      const contractInfo = await etherscanClient.getContractInfo(target);
      const contractInfoMap = new Map();
      contractInfoMap.set(target.toLowerCase(), contractInfo);

      if (options.json) {
        console.log(JSON.stringify(decodedCall, null, 2));
      } else {
        printDecodedCalls([decodedCall], contractInfoMap);
      }

      // If explain flag is set, get explanation from Claude
      if (options.explain) {
        console.log(chalk.blue('\n' + '='.repeat(60)));
        console.log(chalk.bold.blue('AI Explanation'));
        console.log(chalk.blue('='.repeat(60) + '\n'));

        const explainer = new Explainer();

        // Check if Claude CLI is available
        const claudeAvailable = await explainer.isClaudeAvailable();
        if (!claudeAvailable) {
          console.error(chalk.red('Error: Claude CLI is not available.'));
          console.error(chalk.yellow('Please install the claude CLI to use the --explain flag.'));
          process.exit(1);
        }

        // Get explanation
        const explanation = await explainer.explainCall(decodedCall, contractInfo);
        console.log(explanation);
        console.log();
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

function printDecodedCalls(calls: any[], contractInfoMap?: Map<string, any>) {
  console.log(chalk.bold.green(`\nDecoded ${calls.length} call(s):\n`));

  calls.forEach((call, index) => {
    const contractInfo = contractInfoMap?.get(call.target.toLowerCase());

    console.log(chalk.bold.cyan(`Call ${index + 1}:`));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.yellow('Target:'), call.target);

    if (contractInfo && contractInfo.name !== 'Unknown Contract') {
      if (contractInfo.isProxy && contractInfo.implementationName) {
        // Show proxy with implementation
        console.log(chalk.yellow('Contract:'), chalk.green(`${contractInfo.name} (Proxy)`));
        console.log(chalk.yellow('Implementation:'), chalk.green(contractInfo.implementationName));
      } else if (contractInfo.isProxy) {
        // Proxy but no implementation name
        console.log(chalk.yellow('Contract:'), chalk.green(`${contractInfo.name} (Proxy)`));
      } else {
        // Regular contract
        console.log(chalk.yellow('Contract:'), chalk.green(contractInfo.name));
      }
    }

    console.log(chalk.yellow('Function:'), call.functionSignature);

    if (call.args && call.args.length > 0) {
      console.log(chalk.yellow('Arguments:'));
      call.args.forEach((arg: any, argIndex: number) => {
        const argValue = formatArgument(arg);
        console.log(`  ${chalk.gray(`[${argIndex}]`)} ${argValue}`);
      });
    } else {
      console.log(chalk.yellow('Arguments:'), chalk.gray('none'));
    }

    console.log(chalk.yellow('Raw Data:'), chalk.gray(truncateString(call.rawCallData, 100)));
    console.log();
  });
}

function formatArgument(arg: any): string {
  if (typeof arg === 'bigint') {
    return `${arg.toString()} (${chalk.gray('0x' + arg.toString(16))})`;
  }
  if (typeof arg === 'string') {
    if (arg.startsWith('0x') && arg.length > 50) {
      return truncateString(arg, 50);
    }
    return arg;
  }
  if (Array.isArray(arg)) {
    if (arg.length === 0) return '[]';
    if (arg.length > 3) {
      return `[${arg.slice(0, 3).map(formatArgument).join(', ')}, ... ${arg.length - 3} more]`;
    }
    return `[${arg.map(formatArgument).join(', ')}]`;
  }
  if (typeof arg === 'object' && arg !== null) {
    return JSON.stringify(arg, (_, v) => typeof v === 'bigint' ? v.toString() : v);
  }
  return String(arg);
}

function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  const half = Math.floor((maxLength - 3) / 2);
  return `${str.slice(0, half)}...${str.slice(-half)}`;
}

program.parse();
