export interface OnboardingProps {
  appName: string;
  /** Who is signed in, so "wrong account?" has something to be checked against. */
  email: string;
  onCreated: () => Promise<void>;
}
