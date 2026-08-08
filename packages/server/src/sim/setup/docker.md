# Sim Docker-Postgres — ko'p-baza floti (P3 parallel)

`provision.ts::ensureDocker(dbUrl)` port va baza-nomni URL'dan o'zi ajratadi, konteynerni
yaratadi/yoqadi. Nom-formula: konteyner `birjoy-sim-<port>`, volume `birjoy_sim_<port>`.

⚠️ **MEROS-ISTISNO:** port **5434** → konteyner `birjoy-sim-t1`, volume `birjoy_sim_t1`
(birinchi sim shu nom bilan yaratilgan; formula qo'llansa band portga ikkinchi konteyner
ochilib, yurayotgan yugurish buzilardi).

- Ulanish satri shakli (env `SIM_DATABASE_URL`): `postgresql://sim:sim@localhost:<port>/<baza>`
  — baza-nom **majburan** `birjoy_sim` bilan boshlanadi (app-DB himoyasi, guardSimUrl).

## Flot misoli: 5434–5441 = 8 parallel yo'lak

| Port | Baza          | Konteyner          | Volume            |
| ---- | ------------- | ------------------ | ----------------- |
| 5434 | birjoy_sim_t1 | birjoy-sim-t1 (⚠️) | birjoy_sim_t1     |
| 5435 | birjoy_sim_t2 | birjoy-sim-5435    | birjoy_sim_5435   |
| 5436 | birjoy_sim_t3 | birjoy-sim-5436    | birjoy_sim_5436   |
| 5437 | birjoy_sim_t4 | birjoy-sim-5437    | birjoy_sim_5437   |
| 5438 | birjoy_sim_t5 | birjoy-sim-5438    | birjoy_sim_5438   |
| 5439 | birjoy_sim_t6 | birjoy-sim-5439    | birjoy_sim_5439   |
| 5440 | birjoy_sim_t7 | birjoy-sim-5440    | birjoy_sim_5440   |
| 5441 | birjoy_sim_t8 | birjoy-sim-5441    | birjoy_sim_5441   |

Qo'lda yaratish (provision o'zi ham qiladi — misol 5435):
`docker run -d --name birjoy-sim-5435 -e POSTGRES_USER=sim -e POSTGRES_PASSWORD=sim -e POSTGRES_DB=birjoy_sim_t2 -p 5435:5432 -v birjoy_sim_5435:/var/lib/postgresql/data postgres:16`

- To'xtatish / yoqish: `docker stop <konteyner>` · `docker start <konteyner>`
- Butunlay o'chirish (ma'lumot bilan): `docker rm -f <konteyner> && docker volume rm <volume>`
- Ichiga kirish: `docker exec -it <konteyner> psql -U sim -d <baza>`
