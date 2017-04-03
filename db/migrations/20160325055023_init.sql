-- migrate:up
create table "accounts" (
  "id" serial primary key,
  "source" text,
  "reference" text,
  "name" text,
  "currency" text not null,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null,
  unique("source", "reference")
);

create table "transactions" (
  "id" serial primary key,
  "accountId" integer references accounts(id) not null,
  "reference" text,
  "timestamp" timestamptz not null,
  "amount" decimal not null,
  "currency" text not null,
  "type" text not null,
  "exchangeReference" text,
  "exchangeValue" decimal,
  "exchangeCurrency" text,
  "usdPrice" decimal,
  "usdValue" text,
  "transferTransactionId" integer references transactions(id),
  "source" text not null,
  "sourceAmount" decimal not null,
  "sourceType" text,
  "sourceAddress" text,
  "sourceDescription" text,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null,
  unique("accountId", "reference")
);

create table "disposals" (
  "id" serial primary key,
  "buyTransactionId" integer references transactions(id) not null,
  "sellTransactionId" integer references transactions(id) not null,
  "acquiredAt" timestamptz not null,
  "disposedAt" timestamptz not null,
  "amount" decimal not null,
  "currency" text not null,
  "costBasis" decimal not null,
  "salePrice" decimal not null,
  "gain" decimal not null,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null
);

-- migrate:down

