-- use this sql to generate a report listing all disposals for a tax year
-- for entry into form 8949
select
  currency,
  case when min("acquiredAt")::date = max("acquiredAt")::date
    then min("acquiredAt")::date::text
    else 'VARIOUS' end as "date_acquired",
  "disposedAt"::date as "date_sold",
  term,
  count(id) as num_transactions,
  sum(amount) as quantity,
  sum("salePrice") as "sale_price",
  sum("costBasis") as "cost_basis",
  sum(gain) as gain
from disposals
where "disposedAt" between '2017-01-01' and '2018-01-01'
group by "currency", "term", "date_sold"
order by "currency", "date_sold"
