export class LimitError extends Error {
  readonly cap: string;

  constructor(cap: string) {
    super(`The ${cap} limit has been reached.`);
    this.name = 'LimitError';
    this.cap = cap;
  }
}
