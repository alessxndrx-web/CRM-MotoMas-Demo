export type RepositoryRecord = {
  id: string;
};

export interface CollectionRepository<T extends RepositoryRecord> {
  list(): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  save(record: T): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface LeadRepository<T extends RepositoryRecord>
  extends CollectionRepository<T> {}

export interface CustomerRepository<T extends RepositoryRecord>
  extends CollectionRepository<T> {}

export interface CustomerFileRepository<T extends RepositoryRecord>
  extends CollectionRepository<T> {}

export interface CustomerFileDocumentRepository<T extends RepositoryRecord>
  extends CollectionRepository<T> {}

export interface InventoryRepository<T extends RepositoryRecord>
  extends CollectionRepository<T> {}

export interface TransferRepository<T extends RepositoryRecord>
  extends CollectionRepository<T> {}

export interface ReservationRepository<T extends RepositoryRecord>
  extends CollectionRepository<T> {}

export interface SalesRepository<T extends RepositoryRecord>
  extends CollectionRepository<T> {}

export interface QuoteRepository<T extends RepositoryRecord>
  extends CollectionRepository<T> {}

export interface CreditApplicationRepository<T extends RepositoryRecord>
  extends CollectionRepository<T> {}

export interface ActivityRepository<T extends RepositoryRecord>
  extends CollectionRepository<T> {}

export interface MarketingCampaignRepository<T extends RepositoryRecord>
  extends CollectionRepository<T> {}
