import { EventEmitter } from 'events';
import { Domain } from '../domain';
import { RepositoryMethodFailedError, RuleFailedError } from '../errors';
import { IQueryOptions, IRepository } from '../repository';
import { ID, Instance, OperationResult, Persisted, Rule, SaveInput, UpdateInput } from '../types';

export interface IService<T> extends IRepository<T>, EventEmitter {
  create(data: SaveInput<T>): Promise<Persisted<T>>;
  createInstance(data: SaveInput<T>): Promise<Instance<Persisted<T>>>;
}

type EventName = keyof IRepository<any> | 'error';
type Func = (...args: any[]) => any;

const { log } = console;

export class Service<T> implements IService<T> {
  constructor(public repository: IRepository<T>) {
    // this.createProxyMethods(repository);
  }

  private _eventListeners: Record<string, Func[]> = {};
  private _onceListeners: Record<string, Func[]> = {};

  private _preHooks: Partial<Record<keyof IRepository<T>, Func[]>> = {};
  private _postHooks: Partial<Record<keyof IRepository<T>, Func[]>> = {};

  private _rules: Partial<Record<keyof IRepository<T>, Rule[]>> = {};
  private _rulesOnce: Partial<Record<keyof IRepository<T>, Rule[]>> = {};

  private _domain?: Domain;
  get domain(): Domain | undefined {
    return this._domain;
  }
  set domain(domain: Domain | undefined) {
    this._domain = domain;
  }

  private _name?: string;
  get name(): string | undefined {
    return this._name;
  }
  set name(name: string | undefined) {
    this._name = name;
  }

  addListener(eventName: EventName, listener: Func): this {
    if (!this._eventListeners[eventName as string]) {
      this._eventListeners[eventName as string] = [];
    }
    this._eventListeners[eventName as string].push(listener);
    return this;
  }
  addPostHook(method: keyof IRepository<T>, hook: Func): this {
    if (!this._postHooks[method]) {
      this._postHooks[method] = [];
    }
    this._postHooks[method]?.push(hook);
    return this;
  }
  addPreHook(method: keyof IRepository<T>, hook: Func): this {
    if (!this._preHooks[method]) {
      this._preHooks[method] = [];
    }
    this._preHooks[method]?.push(hook);
    return this;
  }
  addRule(method: keyof IRepository<T>, rule: Rule): this {
    if (!this._rules[method]) {
      this._rules[method] = [];
    }
    this._rules[method]?.push(rule);
    return this;
  }
  addRuleOnce(method: keyof IRepository<T>, rule: Rule): this {
    if (!this._rulesOnce[method]) {
      this._rulesOnce[method] = [];
    }
    this._rulesOnce[method]?.push(rule);
    return this;
  }
  count(options?: IQueryOptions<T>): Promise<number> {
    return this.repoAction('count', this.repository.count.bind(this.repository), options);
  }
  create(data: SaveInput<T>): Promise<Persisted<T>> {
    return this.save(data);
  }
  async createInstance(data: SaveInput<T>): Promise<Instance<Persisted<T>>> {
    const model = await this.save(data);
    const instance: Instance<Persisted<T>> = {
      ...model,
      update: async () => {
        return this.update(model as UpdateInput<T>);
      },
      delete: async () => {
        return this.delete(model.id);
      },
    };

    return instance;
  }
  delete(id: ID): Promise<Persisted<T>> {
    return this.repoAction('delete', this.repository.delete.bind(this.repository), id);
  }
  deleteMany(options: IQueryOptions<T>): Promise<OperationResult> {
    return this.repoAction('deleteMany', this.repository.deleteMany.bind(this.repository), options);
  }
  emit(eventName: EventName, ...args: any[]): boolean {
    const listeners = this._eventListeners[eventName as string] || [];
    const onceListeners = this._onceListeners[eventName as string] || [];
    const allListeners = [...listeners, ...onceListeners];
    for (const listener of allListeners) {
      try {
        if ((listener as any)[Symbol.toStringTag] === 'AsyncFunction') {
          listener(...args).catch(log);
        } else {
          listener(...args);
        }
      } catch (_) {
        log(_);
      }
    }
    delete this._onceListeners[eventName as string];
    return true;
  }
  eventNames(): (string | symbol)[] {
    return [...Object.keys(this._eventListeners), ...Object.keys(this._onceListeners)];
  }
  exists(options: IQueryOptions<T>): Promise<boolean> {
    return this.repoAction('exists', this.repository.exists.bind(this.repository), options);
  }
  find(id: ID, options?: IQueryOptions<T>): Promise<Persisted<T> | null> {
    return this.repoAction('find', this.repository.find.bind(this.repository), id, options);
  }
  findAndDelete(id: ID): Promise<Persisted<T> | null> {
    return this.repoAction('findAndDelete', this.repository.findAndDelete.bind(this.repository), id);
  }
  findAndUpdate(id: ID, data: UpdateInput<T>): Promise<Persisted<T> | null> {
    return this.repoAction('findAndUpdate', this.repository.findAndUpdate.bind(this.repository), id, data);
  }
  get(id: ID, options?: IQueryOptions<T>): Promise<Persisted<T>> {
    return this.repoAction('get', this.repository.get.bind(this.repository), id, options);
  }
  getMany(options?: IQueryOptions<T>): Promise<Persisted<T>[]> {
    return this.repoAction('getMany', this.repository.getMany.bind(this.repository), options);
  }
  getMaxListeners(): number {
    return Infinity;
  }
  listenerCount(eventName: EventName): number {
    return (
      (this._eventListeners[eventName as string] || []).length + (this._onceListeners[eventName as string] || []).length
    );
  }
  listeners(eventName: EventName): Func[] {
    return [...(this._eventListeners[eventName as string] || []), ...(this._onceListeners[eventName as string] || [])];
  }
  off(eventName: EventName, listener: Func): this {
    return this.removeListener(eventName, listener);
  }
  on(eventName: EventName, listener: Func): this {
    return this.addListener(eventName, listener);
  }
  once(eventName: EventName, listener: Func): this {
    if (!this._onceListeners[eventName as string]) {
      this._onceListeners[eventName as string] = [];
    }
    this._onceListeners[eventName as string].push(listener);
    return this;
  }
  post(method: keyof IRepository<T>, hook: Func): this {
    return this.addPostHook(method, hook);
  }
  pre(method: keyof IRepository<T>, hook: Func): this {
    return this.addPreHook(method, hook);
  }
  prependListener(eventName: EventName, listener: Func): this {
    this._eventListeners[eventName as string].unshift(listener);
    return this;
  }
  prependOnceListener(eventName: EventName, listener: Func): this {
    this._onceListeners[eventName as string].unshift(listener);
    return this;
  }
  rawListeners(eventName: EventName): Func[] {
    return this.listeners(eventName);
  }
  removeAllListeners(eventName?: EventName | undefined): this {
    if (eventName) {
      delete this._eventListeners[eventName as string];
      delete this._onceListeners[eventName as string];
    } else {
      this._eventListeners = {};
      this._onceListeners = {};
    }
    return this;
  }
  removeListener(eventName: EventName, listener: Func): this {
    if (this._eventListeners[eventName as string]) {
      const index = this._eventListeners[eventName as string].indexOf(listener);
      if (index >= 0) {
        this._eventListeners[eventName as string].splice(index, 1);
      }
    }
    if (this._onceListeners[eventName as string]) {
      const index = this._onceListeners[eventName as string].indexOf(listener);
      if (index >= 0) {
        this._onceListeners[eventName as string].splice(index, 1);
      }
    }
    return this;
  }
  removeRule(method: keyof IRepository<any>, rule: Rule): void {
    if (this._rules[method]) {
      const index = this._rules[method]?.indexOf(rule) ?? -1;
      if (index >= 0) {
        this._rules[method]?.splice(index, 1);
      }
    }
    if (this._rulesOnce[method]) {
      const index = this._rulesOnce[method]?.indexOf(rule) ?? -1;
      if (index >= 0) {
        this._rulesOnce[method]?.splice(index, 1);
      }
    }
  }
  private async repoAction(action: keyof IRepository<T>, method: Func, ...args: any[]): Promise<any> {
    try {
      await this.domain?.runRules(action, ...args);
      await this.runRules(action, ...args);

      // const result = await method(...args);
      const result = await this.runPreHooks(action, method, ...args);

      const finalResult = await this.runPostHooks(action, result, ...args);

      const finalArgs = args && args.length ? args.concat(finalResult) : [finalResult];
      process.nextTick(() => {
        try {
          this.emit(action, ...finalArgs);
        } catch (_) {
          log(_);
        }
      });

      return finalResult;
    } catch (error) {
      const repoActionError = new RepositoryMethodFailedError(action, error);
      process.nextTick(() => {
        try {
          this.emit('error', repoActionError);
        } catch (_) {
          log(_);
        }
      });
      throw repoActionError;
    }
  }
  async runRules(method: keyof IRepository<T>, ...args: any[]): Promise<void> {
    const rules = this._rules[method];
    if (rules) {
      for (const rule of rules) {
        const result = await rule(...args);
        if (typeof result === 'string') {
          throw new RuleFailedError(rule, result);
        }
        if (typeof result === 'boolean' && result === false) {
          throw new RuleFailedError(rule);
        }
      }
    }

    const rulesOnces = this._rulesOnce[method];
    if (rulesOnces) {
      for (const rule of rulesOnces) {
        const result = await rule(...args);
        if (typeof result === 'string') {
          throw new RuleFailedError(rule, result);
        }
        if (typeof result === 'boolean' && result === false) {
          throw new RuleFailedError(rule);
        }
        this._rulesOnce[method]?.splice(rulesOnces.indexOf(rule), 1);
      }
    }
  }
  save(data: SaveInput<T>): Promise<Persisted<T>> {
    return this.repoAction('save', this.repository.save.bind(this.repository), data);
  }
  setMaxListeners(n: number): this {
    return this;
  }
  update(data: UpdateInput<T>): Promise<Persisted<T>> {
    return this.repoAction('update', this.repository.update.bind(this.repository), data);
  }
  updateMany(options: IQueryOptions<T>, data: UpdateInput<T>): Promise<OperationResult> {
    return this.repoAction('updateMany', this.repository.updateMany.bind(this.repository), options, data);
  }
  private async runPreHooks(method: keyof IRepository<T>, final: Func, ...args: any[]): Promise<any> {
    const hooks = this._preHooks[method];
    if (hooks && hooks.length) {
      const nexts: Func[] = [];
      for (let i = hooks.length - 1; i >= 0; i--) {
        if (i === hooks.length - 1) {
          const next = async (...a: any[]) => {
            const finalArgs = a && a.length ? a : args;
            return final(...finalArgs);
          };
          nexts.push(next);
        } else {
          const nextHook = hooks[i + 1];
          const reverseIndex = hooks.length - 2 - i;
          const nextNext = nexts[reverseIndex];
          const next = async (...a: any[]) => {
            const finalArgs = a && a.length ? a : args;
            return nextHook(...finalArgs, nextNext);
          };
          nexts.push(next);
        }
      }
      // reverse the nexts so they match the order of the hooks
      nexts.reverse();

      // now call the first hook
      const firstHook = hooks[0];
      return firstHook(...args, nexts[0]);
    }

    return final(...args);
  }
  private async runPostHooks(method: keyof IRepository<T>, result: any, ...args: any[]): Promise<any> {
    const hooks = this._postHooks[method];
    if (hooks && hooks.length) {
      const nexts: Func[] = [];
      for (let i = hooks.length - 1; i >= 0; i--) {
        if (i === hooks.length - 1) {
          const next = async (r: any) => {
            return r ?? result;
          };
          nexts.push(next);
        } else {
          const nextHook = hooks[i + 1];
          const reverseIndex = hooks.length - 2 - i;
          const nextNext = nexts[reverseIndex];
          const next = async (r: any) => {
            const finalResult = r ?? result;
            return nextHook(finalResult, nextNext, ...args);
          };
          nexts.push(next);
        }
      }
      // reverse the nexts so they match the order of the hooks
      nexts.reverse();

      // now call the first hook
      const firstHook = hooks[0];
      return firstHook(result, nexts[0], ...args);
    }

    return result;
  }

  // createProxyMethods(repository: IRepository<T>) {
  //     for (const method of Object.getOwnPropertyNames(Object.getPrototypeOf(repository))) {
  //         switch (method) {
  //             case "constructor":
  //                 break;
  //             case "save":
  //                 this.createProxiesForSaveMethod(repository);
  //                 break;
  //             // case "read":
  //             //     this.createProxyMethodForRead(repository);
  //             //     break;
  //             // case "update":
  //             //     this.createProxyMethodForUpdate(repository);
  //             //     break;
  //             // case "delete":
  //             //     this.createProxyMethodForDelete(repository);
  //             //     break;
  //             // case "list":
  //             //     this.createProxyMethodForList(repository);
  //             //     break;
  //             // default:
  //             //     throw new Error(`Method ${method} not implemented in Service`);
  //         }
  //         // (this as any)[method] = () => {
  //         //     // return (repository as any)[method]();
  //         //     // get the arguments and pass them to the
  //         //     // repository method
  //         //     const args = Array.from(arguments);
  //         //     return (repository as any)[method](...args);
  //         // }
  //     }
  // }
  // createProxiesForSaveMethod(repository: IRepository<T>) {
  //     (this as any)['save'] = async (data: SaveInput<T>) => {
  //         const definition: T = await repository.save(data);

  //         return definition;
  //     }

  //     (this as any)['create'] = (this as any)['save'];

  //     (this as any)[method] = async (data: SaveInput<T>) => {
  //         const definition: T = await repository.save(data);

  //         if (method === "createInstance") {
  //             const instance: Instance<T> = {
  //                 ...definition,
  //                 update: async () => {
  //                     // instance checks ??
  //                     // instance pre hooks
  //                     // pass to model
  //                     // instance post hooks
  //                     return { ok: true, records: 1 };
  //                 },
  //                 delete: async () => {
  //                     // instance checks ??
  //                     // instance pre hooks
  //                     // pass to model
  //                     // instance post hooks
  //                     return repository.delete(definition.id);
  //                 }
  //             } as any;
  //             return instance;
  //         }

  //         return definition;
  //     }
  // }

  // createProxiesForMethods(method: string, repository: IRepository<T>) {
  //     (this as any)[method] = async (data: SaveInput<T>) => {
  //         const definition: T = await (repository as any)[method](data);

  //         return definition;
  //     }
  // }

  //     async create<T extends ModelDefinition>(definition: T, params: QueryParams, meta?: QueryMeta): Promise<T> {
  //     // run domain checks

  //     // run pre hooks

  //     // run post hooks

  //     // return created instance
  //     return definition;
  //   }
}
