import type { BusinessRole } from '@/services/identity';

// Elección de registro. "both" crea la cuenta con productor y comprador a la vez.
// No existe opción de administrador en el registro público.
export type RoleChoice = 'producer' | 'buyer' | 'both';

export const ROLE_CHOICE_OPTIONS: { value: RoleChoice; label: string }[] = [
  { value: 'producer', label: '🌾 Quiero vender' },
  { value: 'buyer', label: '🛒 Quiero comprar' },
  { value: 'both', label: '🌾🛒 Quiero comprar y vender' },
];

export function rolesForChoice(choice: RoleChoice): BusinessRole[] {
  if (choice === 'both') return ['producer', 'buyer'];
  return [choice];
}

export const ROLE_LABELS: Record<BusinessRole, string> = {
  producer: 'Productor',
  buyer: 'Comprador',
};
