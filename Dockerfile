FROM node:8

ENV PATH /app/node_modules/.bin:$PATH

# install dbmate
RUN curl -fsSL -o /usr/local/bin/dbmate \
    https://github.com/amacneil/dbmate/releases/download/v1.3.0/dbmate-linux-amd64 \
  && chmod +x /usr/local/bin/dbmate

# create app directory
RUN mkdir /app
WORKDIR /app

# install packages
COPY package.json yarn.lock /app/
RUN yarn install

# copy remaining files
COPY . /app/
