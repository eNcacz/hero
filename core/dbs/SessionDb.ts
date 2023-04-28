import * as Database from 'better-sqlite3';
import { Database as SqliteDatabase, Transaction } from 'better-sqlite3';
import Log from '@ulixee/commons/lib/Logger';
import SqliteTable from '@ulixee/commons/lib/SqliteTable';
import * as Fs from 'fs';
import * as Path from 'path';
import ResourcesTable from '../models/ResourcesTable';
import DomChangesTable from '../models/DomChangesTable';
import CommandsTable from '../models/CommandsTable';
import WebsocketMessagesTable from '../models/WebsocketMessagesTable';
import FrameNavigationsTable from '../models/FrameNavigationsTable';
import FramesTable from '../models/FramesTable';
import PageLogsTable from '../models/PageLogsTable';
import SessionTable from '../models/SessionTable';
import MouseEventsTable from '../models/MouseEventsTable';
import FocusEventsTable from '../models/FocusEventsTable';
import ScrollEventsTable from '../models/ScrollEventsTable';
import SessionLogsTable from '../models/SessionLogsTable';
import ScreenshotsTable from '../models/ScreenshotsTable';
import DevtoolsMessagesTable from '../models/DevtoolsMessagesTable';
import TabsTable from '../models/TabsTable';
import ResourceStatesTable from '../models/ResourceStatesTable';
import SocketsTable from '../models/SocketsTable';
import Core from '../index';
import StorageChangesTable from '../models/StorageChangesTable';
import AwaitedEventsTable from '../models/AwaitedEventsTable';
import DetachedElementsTable from '../models/DetachedElementsTable';
import SnippetsTable from '../models/SnippetsTable';
import DetachedResourcesTable from '../models/DetachedResourcesTable';
import OutputTable from '../models/OutputTable';
import FlowHandlersTable from '../models/FlowHandlersTable';
import FlowCommandsTable from '../models/FlowCommandsTable';
import InteractionStepsTable from '../models/InteractionStepsTable';
import env from '../env';

const { log } = Log(module);

interface IDbOptions {
  readonly?: boolean;
  fileMustExist?: boolean;
}

export default class SessionDb {
  private static byId = new Map<string, SessionDb>();
  private static hasInitialized = false;

  public get readonly(): boolean {
    return this.db?.readonly;
  }

  public get isOpen(): boolean {
    return this.db?.open;
  }

  public readonly path: string;

  public readonly commands: CommandsTable;
  public readonly frames: FramesTable;
  public readonly frameNavigations: FrameNavigationsTable;
  public readonly sockets: SocketsTable;
  public readonly resources: ResourcesTable;
  public readonly resourceStates: ResourceStatesTable;
  public readonly websocketMessages: WebsocketMessagesTable;
  public readonly domChanges: DomChangesTable;
  public readonly detachedElements: DetachedElementsTable;
  public readonly detachedResources: DetachedResourcesTable;
  public readonly snippets: SnippetsTable;
  public readonly interactions: InteractionStepsTable;
  public readonly flowHandlers: FlowHandlersTable;
  public readonly flowCommands: FlowCommandsTable;
  public readonly pageLogs: PageLogsTable;
  public readonly sessionLogs: SessionLogsTable;
  public readonly session: SessionTable;
  public readonly mouseEvents: MouseEventsTable;
  public readonly focusEvents: FocusEventsTable;
  public readonly scrollEvents: ScrollEventsTable;
  public readonly storageChanges: StorageChangesTable;
  public readonly screenshots: ScreenshotsTable;
  public readonly devtoolsMessages: DevtoolsMessagesTable;
  public readonly awaitedEvents: AwaitedEventsTable;
  public readonly tabs: TabsTable;
  public readonly output: OutputTable;
  public readonly sessionId: string;

  public keepAlive = false;

  private readonly batchInsert?: Transaction;
  private readonly saveInterval: NodeJS.Timeout;

  private db: SqliteDatabase;
  private readonly tables: SqliteTable<any>[] = [];

  constructor(sessionId: string, dbOptions: IDbOptions = {}, customPath?: string) {
    const { readonly = false, fileMustExist = false } = dbOptions;
    this.sessionId = sessionId;
    if (!customPath) SessionDb.createDefaultDir();
    this.path = customPath ?? Path.join(SessionDb.defaultDatabaseDir, `${sessionId}.db`);
    this.db = new Database(this.path, { readonly, fileMustExist });
    if (env.enableSqliteWal) {
      this.db.unsafeMode(false);
      this.db.pragma('journal_mode = WAL');
    }
    if (!readonly) {
      this.saveInterval = setInterval(this.flush.bind(this), 5e3).unref();
    }

    this.commands = new CommandsTable(this.db);
    this.tabs = new TabsTable(this.db);
    this.frames = new FramesTable(this.db);
    this.frameNavigations = new FrameNavigationsTable(this.db);
    this.sockets = new SocketsTable(this.db);
    this.resources = new ResourcesTable(this.db);
    this.resourceStates = new ResourceStatesTable(this.db);
    this.websocketMessages = new WebsocketMessagesTable(this.db);
    this.domChanges = new DomChangesTable(this.db);
    this.detachedElements = new DetachedElementsTable(this.db);
    this.detachedResources = new DetachedResourcesTable(this.db);
    this.snippets = new SnippetsTable(this.db);
    this.flowHandlers = new FlowHandlersTable(this.db);
    this.flowCommands = new FlowCommandsTable(this.db);
    this.pageLogs = new PageLogsTable(this.db);
    this.session = new SessionTable(this.db);
    this.interactions = new InteractionStepsTable(this.db);
    this.mouseEvents = new MouseEventsTable(this.db);
    this.focusEvents = new FocusEventsTable(this.db);
    this.scrollEvents = new ScrollEventsTable(this.db);
    this.sessionLogs = new SessionLogsTable(this.db);
    this.screenshots = new ScreenshotsTable(this.db);
    this.storageChanges = new StorageChangesTable(this.db);
    this.devtoolsMessages = new DevtoolsMessagesTable(this.db);
    this.awaitedEvents = new AwaitedEventsTable(this.db);
    this.output = new OutputTable(this.db);

    this.tables.push(
      this.commands,
      this.tabs,
      this.frames,
      this.frameNavigations,
      this.sockets,
      this.resources,
      this.resourceStates,
      this.websocketMessages,
      this.domChanges,
      this.detachedElements,
      this.detachedResources,
      this.snippets,
      this.flowHandlers,
      this.flowCommands,
      this.pageLogs,
      this.session,
      this.interactions,
      this.mouseEvents,
      this.focusEvents,
      this.scrollEvents,
      this.sessionLogs,
      this.devtoolsMessages,
      this.screenshots,
      this.storageChanges,
      this.awaitedEvents,
      this.output,
    );

    if (!readonly) {
      this.batchInsert = this.db.transaction(() => {
        for (const table of this.tables) {
          try {
            table.runPendingInserts();
          } catch (error) {
            if (String(error).match('attempt to write a readonly database')) {
              clearInterval(this.saveInterval);
              this.db = null;
            }
            log.error('SessionDb.flushError', {
              sessionId: this.sessionId,
              error: String(error),
              table: table.tableName,
            });
          }
        }
      });
    }
  }

  public getCollectedAssetNames(): { resources: string[]; elements: string[]; snippets: string[] } {
    const snippets = new Set<string>();
    for (const snippet of this.snippets.all()) {
      snippets.add(snippet.name);
    }
    const resources = new Set<string>();
    for (const resource of this.detachedResources.all()) {
      resources.add(resource.name);
    }

    const elementNames = this.detachedElements.allNames();

    return {
      snippets: [...snippets],
      resources: [...resources],
      elements: [...elementNames],
    };
  }

  public async close(deleteFile = false): Promise<void> {
    clearInterval(this.saveInterval);

    if (this.db?.open) {
      this.flush();
    }

    if (this.keepAlive) {
      this.db.readonly = true;
      return;
    }

    SessionDb.byId.delete(this.sessionId);
    this.db.close();
    if (deleteFile) {
      await Fs.promises.rm(this.path);
    }
    this.db = null;
  }

  public flush(): void {
    if (this.batchInsert) {
      try {
        this.batchInsert.immediate();
      } catch (error) {
        if (
          String(error).match(/attempt to write a readonly database/) ||
          String(error).match(/database is locked/)
        ) {
          clearInterval(this.saveInterval);
        }
        throw error;
      }
    }
  }

  public static getCached(
    sessionId: string,
    fileMustExist = false,
    customPath?: string,
  ): SessionDb {
    if (sessionId.endsWith('.db')) sessionId = sessionId.split('.db').shift();
    if (!this.byId.get(sessionId)?.db?.open) {
      this.byId.set(
        sessionId,
        new SessionDb(
          sessionId,
          {
            readonly: true,
            fileMustExist,
          },
          customPath,
        ),
      );
    }
    return this.byId.get(sessionId);
  }

  public static createDefaultDir(): void {
    if (!this.hasInitialized) {
      Fs.mkdirSync(this.defaultDatabaseDir, { recursive: true });
      this.hasInitialized = true;
    }
  }

  public static get defaultDatabaseDir(): string {
    return `${Core.dataDir}/hero-sessions`;
  }
}
