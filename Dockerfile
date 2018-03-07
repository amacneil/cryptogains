FROM node:8

ENV NPM_CONFIG_LOGLEVEL=http
ENV PATH /app/node_modules/.bin:$PATH

# install dbmate
RUN curl -fsSL -o /usr/local/bin/dbmate \
    https://github.com/amacneil/dbmate/releases/download/v1.2.1/dbmate-linux-amd64 \
  && chmod +x /usr/local/bin/dbmate

# create app directory
RUN mkdir /app
WORKDIR /app

# install packages
COPY package.json /app/
RUN npm install

# copy remaining files
COPY . /app/
