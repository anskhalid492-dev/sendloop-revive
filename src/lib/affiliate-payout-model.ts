import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { base58 } from '@scure/base';

export const MIN_CRYPTO_PAYOUT_CENTS = 10000;
export const PAYOUT_PROCESSING_DAYS = 60;
export const CRYPTO_NETWORKS = ['usdc_ethereum', 'usdt_tron'] as const;
export type CryptoNetwork = typeof CRYPTO_NETWORKS[number];
export const CRYPTO_LABELS: Record<CryptoNetwork, string> = {
  usdc_ethereum: 'USDC · Ethereum', usdt_tron: 'USDT · Tron (TRC20)',
};
export function validWallet(network: string, input: string): boolean {
  const address = input.trim();
  if (network === 'usdc_ethereum') {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/.test(address)) return false;
    const body = address.slice(2);
    if (body === body.toLowerCase() || body === body.toUpperCase()) return true;
    const hash = Array.from(keccak_256(new TextEncoder().encode(body.toLowerCase())), b => b.toString(16).padStart(2, '0')).join('');
    return [...body].every((char, index) => !/[a-f]/i.test(char) || (parseInt(hash[index], 16) >= 8 ? char === char.toUpperCase() : char === char.toLowerCase()));
  }
  if (network === 'usdt_tron') {
    try {
      const bytes = base58.decode(address);
      if (bytes.length !== 25 || bytes[0] !== 0x41) return false;
      const checksum = sha256(sha256(bytes.slice(0, 21)));
      return bytes.slice(21).every((byte, index) => byte === checksum[index]) && bytes.slice(1, 21).some(byte => byte !== 0);
    } catch { return false; }
  }
  return false;
}
export function canRequestCryptoPayout(available: number, amount: number, wallet: { network: string; address: string } | null): boolean {
  return Number.isSafeInteger(amount) && amount >= MIN_CRYPTO_PAYOUT_CENTS && amount <= available && Boolean(wallet && validWallet(wallet.network, wallet.address));
}
export const MAX_PAYOUT_PROOF_BYTES = 5 * 1024 * 1024;
export const PROOF_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] as const;
export function validatePayoutProof(bytes: Uint8Array, mime: string): void {
  if (!bytes.length || bytes.length > MAX_PAYOUT_PROOF_BYTES) throw new Error('Payment proof must be between 1 byte and 5 MB.');
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  const text = (start: number, end: number) => new TextDecoder().decode(bytes.slice(start, end));
  const valid = mime === 'image/png' ? starts(137,80,78,71,13,10,26,10)
    : mime === 'image/jpeg' ? starts(255,216,255)
    : mime === 'image/webp' ? text(0,4) === 'RIFF' && text(8,12) === 'WEBP'
    : mime === 'application/pdf' ? text(0,5) === '%PDF-' : false;
  if (!valid) throw new Error('Use a valid PNG, JPEG, WebP or PDF payment proof.');
}
export type AffiliateWallet = { network: CryptoNetwork; address: string; updated_at: string };
export type PayoutProof = { id: string; payout_id: string; file_name: string; mime_type: string; size: number; created_at: string };