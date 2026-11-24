import werewolf from './werewolf.jpg';
import villager from './villager.jpg';
import bodyguard from './bodyguard.jpg';
import witch from './witch.jpg';

export const ROLE_IMAGES: Record<string, string> = {
  werewolf,
  villager,
  bodyguard,
  witch,
};

export function getRoleImage(roleId: string): string | undefined {
  return ROLE_IMAGES[roleId];
}
