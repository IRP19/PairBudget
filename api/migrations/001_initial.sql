CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS financial_entries (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  category_id BIGINT REFERENCES categories(id),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  period CHAR(7) NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  date DATE NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  source_account_id TEXT NOT NULL REFERENCES accounts(id),
  destination_account_id TEXT NOT NULL REFERENCES accounts(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  period CHAR(7) NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  date DATE NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  CHECK (source_account_id <> destination_account_id)
);

INSERT INTO accounts (id, name) VALUES
  ('persona-a', 'Persona A'), ('persona-b', 'Persona B'), ('comun', 'Común')
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (name) VALUES
  ('Alquiler'), ('Alimentación'), ('Deporte'), ('Luz'), ('Gas'), ('Agua'),
  ('Internet'), ('Ocio'), ('Gastos Comunes'), ('Inversión'), ('Universidades'),
  ('Fisio'), ('Peluquería'), ('Viajes'), ('Ropa'), ('Salud'), ('Transporte'),
  ('Estética'), ('Varios'), ('Mantenimiento'), ('Regalos'), ('Comida'), ('Otros'),
  ('Nómina'), ('Paga extra')
ON CONFLICT (name) DO NOTHING;
