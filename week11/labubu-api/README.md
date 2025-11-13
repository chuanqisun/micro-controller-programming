# Labubu API

A machine readable, human writable API for storing/retrieving config data

## GitLab Pages setup

Our repo is on GitLab Page, with the following setup:

```
Deploy > Pages > Settings: Use unique domain disabled (unchecked)
Access page: https://classes.pages.cba.mit.edu/863.25/CBA/cba-machine
```

## Firebase setup

The following firebase rule setup ensures security:

- Anyone on the internet can read the config data
- Only users who have a verified @mit.edu or @media.mit.edu email address can write to the config data

```json
{
  "rules": {
    "config": {
      ".read": true,
      ".write": "(auth.token.email.endsWith('@mit.edu') || auth.token.email.endsWith('@media.mit.edu')) && auth.token.email_verified == true"
    }
  }
}
```

In addition, you need to setup Google Authentication provider to allow the domain on which the web app is hosted, which is our GitLab Pages domain: `classes.pages.cba.mit.edu`
