#!/bin/bash
docker volume create --name redis-volume
docker volume create --name rabbit-volume
docker volume create --name mongo-volume
docker volume create --name elasticsearch-volume

# docker volume create --name mongo-volume --opt device=:/Users/anrid/dev/docker-data/mongo-volume
