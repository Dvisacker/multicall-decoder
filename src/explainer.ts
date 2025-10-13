import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import type { DecodedCall } from './types';
import type { ContractInfo } from './etherscan-client';

const execAsync = promisify(exec);

/**
 * Uses Claude CLI to explain decoded multicall data
 */
export class Explainer {
  constructor() {}

  /**
   * Check if claude CLI is available
   */
  async isClaudeAvailable(): Promise<boolean> {
    try {
      await execAsync('which claude');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Format decoded call data for explanation
   */
  private formatCallForExplanation(call: DecodedCall, contractInfo?: ContractInfo): string {
    const lines = [];

    if (contractInfo) {
      lines.push(`Contract: ${contractInfo.name} (${call.target})`);
      lines.push(`Verified: ${contractInfo.isVerified ? 'Yes' : 'No'}`);
    } else {
      lines.push(`Contract Address: ${call.target}`);
    }

    lines.push(`Function: ${call.functionSignature}`);

    if (call.args && call.args.length > 0) {
      lines.push(`Arguments:`);
      call.args.forEach((arg, index) => {
        const argStr = this.formatArgument(arg);
        lines.push(`  [${index}]: ${argStr}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Format argument for display
   */
  private formatArgument(arg: any): string {
    if (typeof arg === 'bigint') {
      return `${arg.toString()} (0x${arg.toString(16)})`;
    }
    if (typeof arg === 'string') {
      return arg;
    }
    if (Array.isArray(arg)) {
      return `[${arg.map(a => this.formatArgument(a)).join(', ')}]`;
    }
    if (typeof arg === 'object' && arg !== null) {
      return JSON.stringify(arg, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
    }
    return String(arg);
  }

  /**
   * Format Claude output with colored headings instead of markdown
   */
  private formatOutput(text: string): string {
    const lines = text.split('\n');
    const formatted: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Convert markdown headers to colored text
      if (line.startsWith('## ')) {
        formatted.push(chalk.bold.cyan(line.replace('## ', '')));
      } else if (line.startsWith('# ')) {
        formatted.push(chalk.bold.blue(line.replace('# ', '')));
      } else if (line.startsWith('### ')) {
        formatted.push(chalk.bold.yellow(line.replace('### ', '')));
      } else {
        formatted.push(line);
      }
    }

    return formatted.join('\n');
  }

  /**
   * Explain a single decoded call using Claude CLI
   */
  async explainCall(call: DecodedCall, contractInfo?: ContractInfo): Promise<string> {
    const claudeAvailable = await this.isClaudeAvailable();
    if (!claudeAvailable) {
      throw new Error('Claude CLI is not available. Please install claude CLI first.');
    }

    const formattedCall = this.formatCallForExplanation(call, contractInfo);

    const prompt = `Provide a clear, objective analysis of this Ethereum smart contract function call. Format your response with markdown headers (##) for major sections.

${formattedCall}

Structure your analysis as follows:

## Function Overview
Explain what this function does

## Arguments
Describe what each argument represents

## Purpose
Explain the likely use case for this call

Be direct and factual. Do not use phrases like "Let me explain" or "I'll analyze". Start directly with the technical analysis.`;

    try {
      // Use claude -p flag to pipe the prompt
      const { stdout, stderr } = await execAsync(`echo ${JSON.stringify(prompt)} | claude -p`, {
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });

      const output = stdout.trim();
      return this.formatOutput(output);
    } catch (error: any) {
      throw new Error(`Failed to get explanation from Claude CLI: ${error.message}`);
    }
  }

  /**
   * Explain multiple decoded calls using Claude CLI
   */
  async explainMulticall(
    calls: DecodedCall[],
    contractInfoMap?: Map<string, ContractInfo>
  ): Promise<string> {
    const claudeAvailable = await this.isClaudeAvailable();
    if (!claudeAvailable) {
      throw new Error('Claude CLI is not available. Please install claude CLI first.');
    }

    const formattedCalls = calls.map((call, index) => {
      const contractInfo = contractInfoMap?.get(call.target.toLowerCase());
      return `Call ${index + 1}:\n${this.formatCallForExplanation(call, contractInfo)}`;
    }).join('\n\n---\n\n');

    const prompt = `Provide a clear, objective analysis of this Ethereum multicall transaction. Format your response with markdown headers (##) for major sections. The multicall contains ${calls.length} individual function calls:

${formattedCalls}

Structure your analysis as follows:

## Transaction Overview
Describe what this multicall transaction accomplishes

## Individual Calls
Break down each call and its function

## Relationship Between Calls
Explain how the calls work together (if they're related)

## Use Case
Describe the likely purpose of this transaction

Be direct and factual. Do not use conversational phrases like "Let me analyze" or "I'll break this down". Start directly with the technical analysis.`;

    try {
      // Use claude -p flag to pipe the prompt
      const { stdout, stderr } = await execAsync(`echo ${JSON.stringify(prompt)} | claude -p`, {
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });

      const output = stdout.trim();
      return this.formatOutput(output);
    } catch (error: any) {
      throw new Error(`Failed to get explanation from Claude CLI: ${error.message}`);
    }
  }
}
