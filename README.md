# cryptogains

Calculates capital gains from cryptocurrency transactions to help file your taxes.

### quickstart

```sh
$ cp config.js.example config.js      # configure accounts
$ docker-compose build                # build container
$ docker-compose run app bash         # development shell
$ dbmate up                           # initialize database
$ node app.js                         # calculate gains
```

### overview

This tool imports your bitcoin, ethereum, and other cryptocurrency trades from:

* Coinbase
* GDAX
* Poloniex
* Local file (CSV)

It then generates a list of all your disposals, with the cost basis for each disposal, and prints a summary table with short & long term gains for each currency per year.

### features

* Automatically import from multiple exchange accounts
* Supports FIFO & LIFO disposal methods

### todo

* Add support for more exchanges (currently supported via CSV import)
* Add support for downloading bitcoin address & HD wallet history (currently supported via CSV import)
* Add support for downloading ethereum address history (including contract output)

### license

[MIT License](/LICENSE)

### disclaimer

> This software is provided for informational purposes only. It does not constitute financial, tax or legal advice, and is not intended to be used by anyone for the purpose of financial advice, legal advice, tax avoidance, promoting, marketing or recommending to any other party any matter addressed herein. For financial or legal advice please consult your own professional.
