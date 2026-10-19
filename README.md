# PairBudget

PairBudget es una app web para gestionar ingresos y gastos de pareja con cuentas individuales y una cuenta común.

## Arquitectura

Nginx sirve la interfaz y reenvía `/api` a la API Node/Express. La API se conecta a PostgreSQL. PostgreSQL no publica ningún puerto y queda en una red interna de Docker Compose.

## Requisitos y puesta en marcha

Necesitas Docker y Docker Compose. Desde la carpeta del proyecto:

```sh
cp .env.example .env
```

Edita `.env` y cambia las contraseñas de ejemplo. Crea el archivo de datos que el Dockerfile incorpora a la interfaz:

```sh
cp household-data.example.js household-data.js
docker compose up -d --build
```

Después de iniciar los contenedores, ejecuta manualmente la migración descrita abajo con el administrador. Al abrir la interfaz, comprueba el servicio en <http://localhost:8080/api/health> (si cambiaste `APP_PORT`, usa ese puerto).

Con la base vacía, en el primer arranque de la interfaz la app importa los ingresos y gastos del archivo `household-data.js`. El archivo de ejemplo contiene datos inventados; reemplázalos por datos propios localmente si corresponde y no los añadas al repositorio.

## Migraciones

La API no migra la base al arrancar. La migración inicial está en `api/migrations/001_initial.sql`; ejecútala manualmente con el usuario administrador definido por `POSTGRES_USER` y la contraseña `POSTGRES_PASSWORD`, no con el rol limitado de la API:

```sh
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < api/migrations/001_initial.sql
```

La propia migración crea las tablas y las cuentas iniciales (`persona-a` → Persona A, `persona-b` → Persona B y `comun` → Común), además de las categorías. Si la base ya está inicializada, `CREATE TABLE IF NOT EXISTS` e inserciones con `ON CONFLICT` hacen que pueda aplicarse de nuevo.

## Rol limitado de la API

Crea el rol con el mismo nombre que `POSTGRES_API_USER` en `.env`; sustituye el marcador por una contraseña segura. Ejecuta esto como administrador, después de crear las tablas:

```sql
CREATE ROLE pairbudget_app LOGIN PASSWORD 'CAMBIAR_POR_UNA_CONTRASEÑA_SEGURA';
GRANT CONNECT ON DATABASE pairbudget TO pairbudget_app;
GRANT USAGE ON SCHEMA public TO pairbudget_app;
GRANT SELECT ON accounts, categories TO pairbudget_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_entries, transfers TO pairbudget_app;
```

Sustituye `pairbudget_app` por el valor exacto de `POSTGRES_API_USER` y `pairbudget` por el valor de `POSTGRES_DB` si los cambias. La API solo necesita los permisos enumerados: lectura de cuentas y categorías y operaciones completas sobre movimientos y transferencias.

## Backups

`scripts/backup_db.sh` requiere que `BACKUP_MOUNT` señale un punto de montaje activo y que `BACKUP_DIR` indique el directorio donde guardar la copia. Ejemplo:

```sh
BACKUP_MOUNT=/mnt/backup BACKUP_DIR=/mnt/backup/pairbudget ./scripts/backup_db.sh
```

El script vuelca la base desde el contenedor `db` a un archivo temporal, valida el formato custom con `pg_restore -l` dentro del contenedor y solo entonces renombra el archivo. El `pg_dump` usa `POSTGRES_USER` y `POSTGRES_DB` del entorno del contenedor. No se ha probado la autenticación: si la configuración de `pg_hba.conf` exige contraseña también para la conexión local por socket, el comando necesitará proporcionar la contraseña de forma segura. Antes de restaurar un backup, restáuralo siempre primero en una base de prueba y comprueba su contenido.

## Seguridad y datos

No subas `.env`, `household-data.js`, backups ni datos financieros reales a Git. `.env.example` y `household-data.example.js` solo contienen valores ficticios. No uses `docker compose down -v`: elimina el volumen de PostgreSQL y sus datos.
