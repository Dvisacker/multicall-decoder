import axios from 'axios';
import { keccak256, toHex } from 'viem';

export interface FunctionSignature {
  name: string;
  signature: string;
}

/**
 * Decodes function signatures using the 4byte directory
 */
export class SignatureDecoder {
  private cache: Map<string, FunctionSignature[]> = new Map();
  private readonly FOUR_BYTE_API = 'https://www.4byte.directory/api/v1/signatures/';

  /**
   * Lookup function signature from 4byte directory
   * @param selector The 4-byte function selector (e.g., "0x12345678")
   */
  async lookupSelector(selector: string): Promise<FunctionSignature[]> {
    // Normalize selector
    const normalizedSelector = selector.toLowerCase().startsWith('0x')
      ? selector.toLowerCase()
      : `0x${selector.toLowerCase()}`;

    // Check cache first
    if (this.cache.has(normalizedSelector)) {
      return this.cache.get(normalizedSelector)!;
    }

    try {
      const response = await axios.get(this.FOUR_BYTE_API, {
        params: {
          hex_signature: normalizedSelector,
        },
        timeout: 10000,
      });

      if (response.data && response.data.results) {
        const signatures: FunctionSignature[] = response.data.results.map((result: any) => ({
          name: result.text_signature.split('(')[0],
          signature: result.text_signature,
        }));

        this.cache.set(normalizedSelector, signatures);
        return signatures;
      }

      return [];
    } catch (error) {
      console.error(`Failed to lookup selector ${normalizedSelector}:`, error);
      return [];
    }
  }

  /**
   * Generate function selector from signature
   * @param signature Function signature (e.g., "transfer(address,uint256)")
   */
  generateSelector(signature: string): string {
    const hash = keccak256(toHex(signature));
    return hash.slice(0, 10); // First 4 bytes
  }

  /**
   * Verify if a signature matches a selector
   */
  verifySignature(signature: string, selector: string): boolean {
    return this.generateSelector(signature) === selector.toLowerCase();
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
