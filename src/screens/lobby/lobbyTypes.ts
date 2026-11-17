export type LobbyPreset = 'basic' | 'chaos' | 'custom';
export type LobbySettings = {
  reveal: boolean;
  wolfSkip: boolean;
  friendlyFire: boolean;
  selfHeal: boolean;
  blindWaste: boolean;
};
export type LobbyPlayer = { name: string; host?: boolean };
export type LobbyDemoState = {
  players: LobbyPlayer[];
  preset: LobbyPreset;
  advanced: boolean;
  settings: LobbySettings;
};

export const defaultLobbyDemoState: LobbyDemoState = {
  players: [
    { name: 'Minh Khang', host: true }, { name: 'Lan Anh' }, { name: 'Hoàng Nam' },
    { name: 'Bảo Trâm' }, { name: 'Đức Huy' },
  ],
  preset: 'basic',
  advanced: false,
  settings: { reveal: true, wolfSkip: false, friendlyFire: false, selfHeal: true, blindWaste: false },
};
