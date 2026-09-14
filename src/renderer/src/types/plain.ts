/**
 * Shared DTOs are classes: alongside their data they carry helper methods
 * (`validate`, `toJSON`, `clone`) inherited from BaseDTO. Those methods exist on
 * the server, where DTOs are constructed via `fromEntity`. What reaches the
 * client is the JSON serialisation, data only, no prototype.
 *
 * Typing client-side values as the class therefore overstates what is there,
 * and any object the client builds itself gets rejected for "missing" methods
 * it was never going to have. `PlainData` strips the methods so client types
 * describe what actually arrives over the wire.
 */
export type PlainData<T> = {
  [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K]: T[K];
};
