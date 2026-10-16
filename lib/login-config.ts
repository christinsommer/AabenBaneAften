type MobileKeyboard = 'numeric' | 'text';

type LoginConfig = {
  memberNoInputMode: MobileKeyboard;
  pinInputMode: MobileKeyboard;
};

// Hardcoded for aabenbaneaften.dk. Future clubs can configure each field
// independently: 'numeric' requests digits, 'text' requests a full keyboard.
// This controls the keyboard hint only, not credential validation.
export const loginConfig: LoginConfig = {
  memberNoInputMode: 'numeric',
  pinInputMode: 'numeric',
};
