select z.currency, z.timestamp::date, sum(z."amountRemaining") as "totalRemaining", sum(z.cost) as "totalCost"
from (
  select t.id, t.currency, t.timestamp, t.amount, coalesce(sum(d.amount), 0) as "disposedAmount", t.amount - coalesce(sum(d.amount), 0) as "amountRemaining", abs("usdValue"::decimal) as cost
  from transactions t
  left join disposals d on t.id = d."buyTransactionId"
  where type != 'transfer'
  and t.amount > 0
  and t.currency = 'BTC'
  group by t.id
  having coalesce(sum(d.amount), 0) < t.amount
  order by t.timestamp
) z
group by 1, 2
order by 2
