SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

--
-- Name: plpgsql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;


--
-- Name: EXTENSION plpgsql; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION plpgsql IS 'PL/pgSQL procedural language';


SET search_path = public, pg_catalog;

SET default_tablespace = '';

SET default_with_oids = false;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE accounts (
    id integer NOT NULL,
    source text,
    reference text,
    name text,
    currency text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE accounts_id_seq OWNED BY accounts.id;


--
-- Name: disposals; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE disposals (
    id integer NOT NULL,
    "buyTransactionId" integer NOT NULL,
    "sellTransactionId" integer NOT NULL,
    "acquiredAt" timestamp with time zone NOT NULL,
    "disposedAt" timestamp with time zone NOT NULL,
    term text NOT NULL,
    amount numeric NOT NULL,
    currency text NOT NULL,
    "costBasis" numeric NOT NULL,
    "salePrice" numeric NOT NULL,
    gain numeric NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: disposals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE disposals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: disposals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE disposals_id_seq OWNED BY disposals.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE transactions (
    id integer NOT NULL,
    "accountId" integer NOT NULL,
    reference text,
    "timestamp" timestamp with time zone NOT NULL,
    amount numeric NOT NULL,
    currency text NOT NULL,
    type text NOT NULL,
    "exchangeReference" text,
    "exchangeValue" numeric,
    "exchangeCurrency" text,
    "usdPrice" numeric,
    "usdValue" text,
    "transferTransactionId" integer,
    source text NOT NULL,
    "sourceAmount" numeric NOT NULL,
    "sourceType" text,
    "sourceAddress" text,
    "sourceDescription" text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE transactions_id_seq OWNED BY transactions.id;


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY accounts ALTER COLUMN id SET DEFAULT nextval('accounts_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY disposals ALTER COLUMN id SET DEFAULT nextval('disposals_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY transactions ALTER COLUMN id SET DEFAULT nextval('transactions_id_seq'::regclass);


--
-- Name: accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: accounts_source_reference_key; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY accounts
    ADD CONSTRAINT accounts_source_reference_key UNIQUE (source, reference);


--
-- Name: disposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY disposals
    ADD CONSTRAINT disposals_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: transactions_accountId_reference_key; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY transactions
    ADD CONSTRAINT "transactions_accountId_reference_key" UNIQUE ("accountId", reference);


--
-- Name: transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: disposals_buyTransactionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY disposals
    ADD CONSTRAINT "disposals_buyTransactionId_fkey" FOREIGN KEY ("buyTransactionId") REFERENCES transactions(id);


--
-- Name: disposals_sellTransactionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY disposals
    ADD CONSTRAINT "disposals_sellTransactionId_fkey" FOREIGN KEY ("sellTransactionId") REFERENCES transactions(id);


--
-- Name: transactions_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY transactions
    ADD CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES accounts(id);


--
-- Name: transactions_transferTransactionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY transactions
    ADD CONSTRAINT "transactions_transferTransactionId_fkey" FOREIGN KEY ("transferTransactionId") REFERENCES transactions(id);


--
-- PostgreSQL database dump complete
--


--
-- Dbmate schema migrations
--

INSERT INTO schema_migrations (version) VALUES
    ('20160325055023');
