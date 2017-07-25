#!/bin/bash
docker volume create --name mongo-volume
docker volume create --name elastic-volume
# docker volume create --name mongo-volume --opt device=:/Users/anrid/dev/docker-data/mongo-volume
