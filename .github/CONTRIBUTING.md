# Contributing

Thanks for choosing to contribute!

The following are a set of guidelines to follow when contributing to this project.

## Code Of Conduct

This project adheres to the Adobe [code of conduct](../CODE_OF_CONDUCT.md). By participating,
you are expected to uphold this code. Please report unacceptable behavior to
[Grp-opensourceoffice@adobe.com](mailto:Grp-opensourceoffice@adobe.com).

## Have A Question?

Start by filing an issue. The existing committers on this project work to reach
consensus around project direction and issue solutions within issue threads
(when appropriate).

## Contributor License Agreement

All third-party contributions to this project must be accompanied by a signed contributor
license agreement. This gives Adobe permission to redistribute your contributions
as part of the project. [Sign our CLA](https://opensource.adobe.com/cla.html). You
only need to submit an Adobe CLA one time, so if you have submitted one previously,
you are good to go!

## Code Reviews

All submissions should come in the form of pull requests and need to be reviewed
by project committers. Read [GitHub's pull request documentation](https://help.github.com/articles/about-pull-requests/)
for more information on sending pull requests.

Lastly, please follow the [pull request template](PULL_REQUEST_TEMPLATE.md) when
submitting a pull request!

## From Contributor To Committer

We love contributions from our community! If you'd like to go a step beyond contributor
and become a committer with full write access and a say in the project, you must
be invited to the project. The existing committers employ an internal nomination
process that must reach lazy consensus (silence is approval) before invitations
are issued. If you feel you are qualified and want to get more deeply involved,
feel free to reach out to existing committers to have a conversation about that.

## Contributing from a corporate account

If your primary GitHub account is a corporate / Enterprise Managed User (EMU) account, it may be unable to fork or push to public repositories like this one. The fix is to contribute from a separate personal GitHub identity on the same machine, using SSH host aliases so each identity uses its own key.

**Problem:** one machine, multiple GitHub identities (e.g. corporate vs. personal), needing a different SSH key per identity — but `git@github.com` only supports one key per config entry.

**Solution:** define extra `Host` aliases in `~/.ssh/config` that all point at the real `github.com`, each pinned to a different key with `IdentitiesOnly yes`:

```sshconfig
# Default identity (e.g. your corporate account)
Host github.com
  HostName github.com
  AddKeysToAgent yes
  UseKeychain yes
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes

# Alternate identity (e.g. your personal account)
Host github.com-personal
  HostName github.com
  AddKeysToAgent yes
  UseKeychain yes
  IdentityFile ~/.ssh/id_ed25519_personal
  IdentitiesOnly yes
```

Then pick the identity by swapping the host in the remote URL:

```sh
git@github.com-personal:adobe/data.git   # uses the personal-account key
git@github.com:adobe/data.git            # uses the default key
```

`IdentitiesOnly yes` is required — without it, `ssh-agent` may offer the wrong key first and authenticate against the wrong account.

**Setup:**

1. Generate a separate SSH key per GitHub identity and add each public key to the corresponding GitHub account.
2. Add one host-alias block per non-default identity to `~/.ssh/config`, as above.
3. For any repo that should use a non-default identity, set its remote to the aliased host (`git remote set-url origin git@github.com-personal:adobe/data.git`), and set that repo's local `user.email` to the matching account.

The `-personal` suffix is just an arbitrary alias name — any label works as long as `HostName` maps it back to `github.com`.

## Security Issues

Security issues shouldn't be reported on this issue tracker. Instead, [file an issue to our security experts](https://helpx.adobe.com/security/alertus.html).