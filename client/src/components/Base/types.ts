export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'outline' | 'muted';

export type PopoverAction = {
  key: string;
  label: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
};


