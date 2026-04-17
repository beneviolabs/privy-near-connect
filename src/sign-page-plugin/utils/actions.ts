import type { ConnectorAction } from '@hot-labs/near-connect/build/actions/types.js';

const YOCTO_PER_NEAR = 10n ** 24n;
const TGAS = 10n ** 12n;

/**
 * Human-readable summary of a single connector action, used by the transaction cards.
 */
export type ActionSummary = {
  /** Action discriminator (e.g. `"FunctionCall"`). */
  type: ConnectorAction['type'];
  /** Display category controlling the badge color on the transaction card. */
  category: 'call' | 'transfer' | 'generic';
  /** For FunctionCall: method name being invoked. */
  method?: string;
  /** For Transfer / FunctionCall: formatted NEAR amount. */
  amount?: string;
  /** For FunctionCall: formatted deposit. */
  deposit?: string;
  /** For FunctionCall: formatted gas. */
  gas?: string;
  /** For FunctionCall: JSON-rendered args (parsed when args arrived as bytes). */
  argsJson?: string;
};

/**
 * Builds a display summary for a single connector action.
 *
 * @param action - A near-connect `ConnectorAction`.
 * @returns An {@link ActionSummary} describing the action for rendering.
 */
export function summarizeAction(action: ConnectorAction): ActionSummary {
  switch (action.type) {
    case 'FunctionCall':
      return {
        type: action.type,
        category: 'call',
        method: action.params.methodName,
        deposit: formatNear(action.params.deposit),
        gas: formatTGas(action.params.gas),
        argsJson: formatArgs(action.params.args),
      };
    case 'Transfer':
      return {
        type: action.type,
        category: 'transfer',
        amount: formatNear(action.params.deposit),
      };
    case 'Stake':
      return {
        type: action.type,
        category: 'generic',
        amount: formatNear(action.params.stake),
      };
    case 'AddKey':
    case 'DeleteKey':
    case 'CreateAccount':
    case 'DeleteAccount':
    case 'DeployContract':
    case 'UseGlobalContract':
    case 'DeployGlobalContract':
      return { type: action.type, category: 'generic' };
    default: {
      const unknown = action as { type: string };
      return { type: unknown.type as ConnectorAction['type'], category: 'generic' };
    }
  }
}

/**
 * Sums the attached gas across all `FunctionCall` actions and returns it as a
 * TGas string (e.g. `"90 TGas"`), which is the exact upper bound on gas consumed.
 *
 * @param actions - Flat list of actions across all transactions being signed.
 * @returns Formatted TGas string, or `null` when no attached gas.
 */
export function estimateMaxFeeNear(actions: ConnectorAction[]): string | null {
  const totalGas = actions.reduce<bigint>(
    (sum, action) => (action.type === 'FunctionCall' ? sum + toBigInt(action.params.gas) : sum),
    0n,
  );
  if (totalGas === 0n) return null;
  return formatTGas(totalGas);
}

function formatArgs(args: unknown): string | undefined {
  if (args == null) return undefined;
  try {
    if (args instanceof Uint8Array) {
      const text = new TextDecoder().decode(args);
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        return text;
      }
    }
    return JSON.stringify(args, null, 2);
  } catch {
    return undefined;
  }
}

function formatNear(yocto: string | bigint | number, maxFractionDigits = 6): string {
  const value = toBigInt(yocto);
  const whole = value / YOCTO_PER_NEAR;
  const remainder = value % YOCTO_PER_NEAR;

  if (remainder === 0n) return whole.toString();

  const fractionSlice = remainder.toString().padStart(24, '0').slice(0, maxFractionDigits);
  const fraction = fractionSlice.replace(/0+$/, '');

  if (fraction) return `${whole}.${fraction}`;
  if (whole === 0n) return `<0.${'0'.repeat(Math.max(maxFractionDigits - 1, 0))}1`;
  return whole.toString();
}

function formatTGas(gas: string | bigint | number): string {
  const value = toBigInt(gas);
  return `${value / TGAS} TGas`;
}

function toBigInt(value: string | bigint | number): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  return BigInt(value);
}
