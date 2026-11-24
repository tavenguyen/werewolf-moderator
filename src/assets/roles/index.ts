import werewolf from './werewolf.jpg';
import villager from './villager.jpg';

export const ROLE_IMAGES: Record<string, string> = {
  werewolf,
  villager,
};

export function getRoleImage(roleId: string): string | undefined {
  return ROLE_IMAGES[roleId];
}
