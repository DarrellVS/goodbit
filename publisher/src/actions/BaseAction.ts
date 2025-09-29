export abstract class BaseAction<Input, Output> {
  abstract execute(input: Input): Promise<Output>;
}
