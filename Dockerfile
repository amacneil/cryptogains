FROM node:10

ENV PATH /app/node_modules/.bin:$PATH

# install postgresql-client
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client \
  && rm -rf /var/lib/apt/lists/*

# install dbmate
RUN curl -fsSL -o /usr/local/bin/dbmate \
    https://github.com/amacneil/dbmate/releases/download/v1.4.1/dbmate-linux-amd64 \
  && chmod +x /usr/local/bin/dbmate

# create app directory
RUN mkdir /app
WORKDIR /app

# install packages
COPY package.json yarn.lock /app/
RUN yarn install

# copy remaining files
COPY . /app/
