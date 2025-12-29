### Network Widget

The Network widget tracks uptime and outages based on a log file. This demo uses a synthetic `network.log` file that follows a ddclient-style format.

#### Log format
```
MMM DD HH:MM:SS <host> <process>: INFO:    [example.com]> detected IPv4 address 10.0.0.1
MMM DD HH:MM:SS <host> <process>: FAILED:  [example.com]> updating example.com: nohost: unable to resolve current IP
```

#### Config
{{ include:code path="include/network.yaml" lang="yaml" }}
