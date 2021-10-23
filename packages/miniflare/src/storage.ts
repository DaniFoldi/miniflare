import assert from "assert";
import path from "path";
import { Storage, StorageFactory, sanitisePath } from "@miniflare/shared";
import type { MemoryStorage } from "@miniflare/storage-memory";
import type IORedis from "ioredis";

const redisConnectionStringRegexp = /^rediss?:\/\//;

export class VariedStorageFactory implements StorageFactory {
  constructor(
    private readonly memoryStorages = new Map<string, MemoryStorage>(),
    private readonly redisConnections = new Map<string, IORedis.Redis>()
  ) {}

  // TODO (someday): override storage for storage-kv-remote

  async storage(
    namespace: string,
    persist?: boolean | string
  ): Promise<Storage> {
    // boolean transformed by PluginStorageFactory
    assert(typeof persist !== "boolean");

    // If not persisting, use in-memory storage, caching these so data
    // persists between reloads
    if (persist === undefined) {
      let storage = this.memoryStorages.get(namespace);
      if (storage) return storage;
      const { MemoryStorage } = await import("@miniflare/storage-memory");
      this.memoryStorages.set(namespace, (storage = new MemoryStorage()));
      return storage;
    }

    // If the persist option is a redis connection string, use Redis storage,
    // caching connections so we can reuse them
    if (redisConnectionStringRegexp.test(persist)) {
      // TODO (someday): display nicer error if @miniflare/storage-redis not installed
      const { RedisStorage } = await import("@miniflare/storage-redis");
      const IORedis = await import("ioredis");
      let connection = this.redisConnections.get(persist);
      if (!connection) {
        this.redisConnections.set(
          persist,
          (connection = new IORedis.default(persist))
        );
      }
      return new RedisStorage(connection, namespace);
    }

    // Otherwise, use file-system storage
    const root = path.join(persist, sanitisePath(namespace));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { FileStorage } = await import("@miniflare/storage-file");
    return new FileStorage(root);
  }

  async dispose(): Promise<void> {
    for (const redisConnection of this.redisConnections.values()) {
      redisConnection.disconnect();
    }
  }
}
