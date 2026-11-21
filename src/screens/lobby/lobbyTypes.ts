export type RoleSelectionMap = Record<string, number>;

export interface LobbyDeckRoleDisplay {
  id: string;
  name: string;
  count: number;
  symbol: string;
  pack: 'BASIC' | 'DEDUCTION' | 'CHAOS';
  packLabel: string;
  side: 'village' | 'wolf' | 'third';
  sideName: string;
  balanceWeight: number;
  implementedInEngine: boolean;
}
