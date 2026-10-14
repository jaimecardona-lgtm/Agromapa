import { ROLE_CHOICE_OPTIONS, type RoleChoice } from '@/auth/roles';
import '../styles/Auth.css';

interface RoleSelectorProps {
  value: RoleChoice;
  onChange: (choice: RoleChoice) => void;
  disabled?: boolean;
}

/** Selector de intención al registrarse. Puede cambiarse después desde "Mi cuenta". */
export function RoleSelector({ value, onChange, disabled = false }: RoleSelectorProps) {
  return (
    <fieldset className="auth-role-selector" disabled={disabled}>
      <legend>¿Qué quieres hacer en Raíces Conectadas?</legend>
      {ROLE_CHOICE_OPTIONS.map((option) => (
        <label key={option.value} className={`auth-role-option ${value === option.value ? 'selected' : ''}`}>
          <input
            type="radio"
            name="role-choice"
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
