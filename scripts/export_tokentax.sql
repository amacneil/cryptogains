select

  case
    when type in ('buy', 'sell') then 'Trade'
    when type = 'transfer' and amount >= 0 then 'Deposit'
    when type = 'transfer' and amount < 0 then 'Withdrawal'
    when type = 'send' then 'Spend'
    when type = 'receive' then 'Trade'
    when type = 'fee' then 'Spend'
  end as "Type",

  case
    when amount >= 0 then amount
    when type = 'transfer' then null
    when type in ('buy', 'sell') then abs("exchangeValue")
    else abs("usdValue"::decimal)
  end as "BuyAmount",

  case
    when amount >= 0 then currency
    when type = 'transfer' then null
    when type in ('buy', 'sell') then "exchangeCurrency"
    else 'USD'
  end as "BuyCurrency",

  case
    when amount < 0 then abs(amount)
    when type = 'transfer' then null
    when type in ('buy', 'sell') then abs("exchangeValue")
    else abs("usdValue"::decimal)
  end as "SellAmount",

  case
    when amount < 0 then currency
    when type = 'transfer' then null
    when type in ('buy', 'sell') then "exchangeCurrency"
    else 'USD'
  end as "SellCurrency",

  null as "FeeAmount",
  null as "FeeCurrency",

  concat('Import:', source) as "Exchange",

  reference as "ExchangeId",

  null as "Group",

  concat('[cryptogains] ', type, ':', id) as "Comment",

  to_char("timestamp", 'MM/DD/YYYY HH24:MI:SS') as "Date",

  abs("usdValue"::decimal)::money as "USDEquivalent"

from transactions
where timestamp < '2018-01-01'
order by timestamp
