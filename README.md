# Git LFS S3 Proxy

This [Cloudflare Pages](https://pages.cloudflare.com/) site acts as a [Git LFS](https://git-lfs.com/) server backed by any S3-compatible service.

- By replacing GitHub's default LFS server with an [R2](https://developers.cloudflare.com/r2) bucket behind this proxy, LFS uploads and downloads become free instead of $0.0875/GiB exceeding 10 GiB/month across all repos [and forks](https://docs.github.com/en/repositories/working-with-files/managing-large-files/collaboration-with-git-large-file-storage#pushing-large-files-to-forks). Storage exceeding the free tier costs $0.015/GB-month on R2 instead of $0.07/GB-month on GitHub.
- On most services, latency is low enough to [serve entire websites](https://github.com/twilligon/git-lfs-client-worker) directly from your LFS server. This also allows you to transparently overcome the [25 MiB](https://developers.cloudflare.com/pages/platform/limits/#file-size) Cloudflare Pages file size limit by automatically adding any files over this size to LFS.

# Usage

**Quick Start**: Visit the [interactive quickstart guide](https://git-lfs-s3-proxy.pages.dev) to automatically generate your LFS server URL with step-by-step instructions.

Or follow the manual setup instructions below:

### Create a bucket

First, create a bucket on an S3-compatible object store to host your LFS assets. In roughly increasing order of cost (as of 2023-08-05), your options include:

- [Cloudflare R2](https://developers.cloudflare.com/r2/buckets/create-buckets/)
- [Backblaze B2](https://help.backblaze.com/hc/en-us/articles/1260803542610-Creating-a-B2-Bucket-using-the-Web-UI)
- [Wasabi](https://docs.wasabi.com/docs/creating-a-bucket)
- [Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/creating-bucket.html) (ideally create an [IAM user](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html) first)
- [Google Cloud Storage](https://cloud.google.com/storage/docs/creating-buckets) (ideally create a [service account](https://cloud.google.com/iam/docs/service-accounts-create) first)
- [Linode Object Storage](https://www.linode.com/docs/products/storage/object-storage/guides/manage-buckets/)
- [DigitalOcean Spaces](https://docs.digitalocean.com/products/spaces/how-to/create/)

We recommend R2 for its generous free tier: your LFS repos can store up to 10 GB and use unlimited bandwidth to write up to 1 million objects and read up to 10 million objects. If serving assets via [LFS Client Worker](https://github.com/twilligon/git-lfs-client-worker), R2 has the additional benefit of being in the same datacenters as the worker.

### Create an access key

Now create an access key with read/write permission to your bucket:

- For Cloudflare R2, [obtain an **Access Key ID** and **Secret Access Key**](https://developers.cloudflare.com/r2/api/s3/tokens/).
- For Backblaze B2, [obtain an **Application Key ID** and **Application Key**](https://www.backblaze.com/docs/cloud-storage-create-and-manage-app-keys).
- For Wasabi, [obtain an **Access Key** and **Secret Key**](https://knowledgebase.wasabi.com/hc/en-us/articles/360019677192-Creating-a-Wasabi-API-Access-Key-Set).
- For Amazon S3, [obtain an **Access Key ID** and **Secret Access Key**](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html#Using_CreateAccessKey).
- For Google Cloud Storage, [obtain an **HMAC Key Access ID** and **HMAC Key Secret**](https://cloud.google.com/storage/docs/authentication/managing-hmackeys).
- For Linode Object Storage, [obtain an **Access Key** and **Secret Key**](https://www.linode.com/docs/products/storage/object-storage/get-started/#generate-an-access-key).
- For DigitalOcean Spaces, [obtain an **Access Key** and **Secret Key**](https://docs.digitalocean.com/products/spaces/how-to/manage-access/#access-keys).

You should now have (to use S3's terminology) two values:

- An access key ID (example: `AKIAIOSFODNN7EXAMPLE`)
- A secret access key (example: `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`)

If either value contains non-alphanumeric characters, you may need to [urlencode](https://www.urlencoder.org/) each value.

### Optional: Deploy your own instance of the proxy

A canonical instance of the proxy runs at `git-lfs-s3-proxy.pages.dev`, which can be used by any project. However, there are a few reasons you might want to run your own:

- The canonical instance runs under the Cloudflare free tier, so it can "only" handle around [100,000 requests per day](https://developers.cloudflare.com/workers/platform/limits#worker-limits).
- The proxy sees your endpoint URL, bucket name, and access key, so malicious instances could read or modify your LFS content.
- To stop using the canonical instance, every commit in your repo must be rewritten to update its LFS server URL, or LFS objects referenced in old commits become inaccessible.
  - If you deploy your own instance, you could instead update it to redirect to a new LFS server.
  - If your instance uses your own domain name, you could point it at a self-hosted LFS server in this scenario.

The proxy is stateless, so you can switch instances just by changing your LFS server URL. If the underlying bucket remains the same, the old URL will continue to work.

To host your own instance of the proxy:

- [Fork](https://github.com/twilligon/git-lfs-s3-proxy/fork) this repo (`twilligon/git-lfs-s3-proxy`) to your account.
- Follow the [Cloudflare Pages Get Started guide](https://developers.cloudflare.com/pages/get-started/guide/):
  - [Sign up for Cloudflare](https://dash.cloudflare.com/sign-up/workers-and-pages) if you haven't already.
  - [Create a new Pages site](https://dash.cloudflare.com/?to=/:account/pages/new/provider/github)
    - Add your GitHub account to Pages.
    - Grant access to your fork of `twilligon/git-lfs-s3-proxy`.
    - Set up your Pages site: set **Build command** to `npm install` and leave all other settings on their defaults.
- If you own a domain name (e.g. `example.com`), you can [add a CNAME record](https://developers.cloudflare.com/pages/platform/custom-domains/#add-a-custom-cname-record) to point a subdomain (e.g. `git-lfs-s3-proxy.example.com`) at your instance. If you don't own a domain, a `pages.dev` subdomain will work just as well, except you'll have to change your LFS server URL if you ever stop using the proxy.

### Find your LFS server URL

We now have everything we need to build the server URL for Git LFS. The format for the URL is

    https://<ACCESS_KEY_ID>:<SECRET_ACCESS_KEY>@<INSTANCE>/<ENDPOINT>/<BUCKET>

where `<ACCESS_KEY_ID>` and `<SECRET_ACCESS_KEY>` are the first and second values from [Create an access key](#create-an-access-key), `<ENDPOINT>` is the S3-compatible API endpoint for your object store, and `<BUCKET>` is the name of the bucket from [Create a bucket](#create-a-bucket). For example, the LFS server URL for a Cloudflare R2 bucket `my-site` with access key ID `ed41437d53a69dfc` and secret access key `dc49cbe38583b850a7454c89d74fcd51` created by a Cloudflare user with [account ID](https://developers.cloudflare.com/fundamentals/get-started/basic-tasks/find-account-and-zone-ids/) `7795d95f5507a0c89bd1ed3de8b57061` using the canonical proxy instance `git-lfs-s3-proxy.pages.dev` would be

    https://ed41437d53a69dfc:dc49cbe38583b850a7454c89d74fcd51@git-lfs-s3-proxy.pages.dev/7795d95f5507a0c89bd1ed3de8b57061.r2.cloudflarestorage.com/my-site

### Fetch existing LFS objects

If you were already using Git LFS, ensure you have a local copy of any existing LFS objects before you change servers:

    git lfs fetch --all

### Configure Git to use your LFS server

Git can be told about the new LFS server in two ways, with slightly different tradeoffs.

#### Public repo

If only certain people with copies of your repo are allowed to write to it, you should [create another access key](#create-an-access-key) with only read permission for your bucket. Then, [create another server URL](#find-your-lfs-server-url) using the read-only access key. Finally, add the server URL containing the **read-only access key** to an `.lfsconfig` file in the root of your repository:

    cd "$(git rev-parse --show-toplevel)"  # move to root of repository
    git config -f .lfsconfig lfs.url 'https://<RO_ACCESS_KEY_ID>:<RO_SECRET_ACCESS_KEY>@<INSTANCE>/<ENDPOINT>/<BUCKET>'
    git add .lfsconfig
    git commit -m "Add .lfsconfig"

To allow a clone of this repo to write to Git LFS, add the server URL containing the **read/write access key** to its `.git/config`:

    git config lfs.url 'https://<RW_ACCESS_KEY_ID>:<RW_SECRET_ACCESS_KEY>@<INSTANCE>/<ENDPOINT>/<BUCKET>'

This config file is not checked into the repository, so the read/write access key remains private.

#### Private repo

If you're working with a private repository where everyone with a clone of the repo **already has read/write access**, you may want to skip generating another access key and manually adding the read/write key to each clone that needs it. (Even in this case, the [public repo approach](#public-repo) is marginally more secure, but the tradeoff may be worth it for convenience's sake.) To set the LFS server URL for everyone at once, granting anyone with a copy of the repo read/write access to the LFS server, put the LFS server URL containing the read/write access key in `.lfsconfig`:

    cd "$(git rev-parse --show-toplevel)"  # move to root of repository
    git config -f .lfsconfig lfs.url 'https://<RW_ACCESS_KEY_ID>:<RW_SECRET_ACCESS_KEY>@<INSTANCE>/<ENDPOINT>/<BUCKET>'
    git add .lfsconfig
    git commit -m "Add .lfsconfig"

### Upload existing LFS objects

If you were already using Git LFS, ensure any existing LFS objects are uploaded to the new server:

    git lfs push --all origin

### Using Git LFS

After [configuring your LFS server](#configure-git-to-use-your-lfs-server), you can set up and use Git LFS as usual.

#### Install Git LFS

If you haven't used Git LFS before, you may need to install it. Run the following command:

    git lfs version

If your output includes `git: 'lfs' is not a git command`, then follow the Git LFS [installation instructions](https://github.com/git-lfs/git-lfs#installing).

#### Install smudge and clean filters

Even if the Git LFS binary was already installed, the smudge and clean filters Git LFS relies upon may not be. Ensure they are installed for your user account:

    git lfs install

#### Start using LFS

You're now ready to [start using Git LFS](https://github.com/git-lfs/git-lfs#example-usage). For example:

- To add any `.iso` files added in future commits to Git LFS, use [`git lfs track`](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-track.adoc):

      git lfs track '*.iso'
      git add .gitattributes
      git commit -m "Add .iso files to Git LFS"

- To add all existing `.iso` files to Git LFS (which [rewrites history](https://stackoverflow.com/q/1491001), so be careful), use [`git lfs migrate`](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-migrate.adoc):

      git fetch --all
      git lfs migrate import --everything --include='*.iso'
      git push --all --force-with-lease

- To add all existing files above 25 MiB to Git LFS (which [rewrites history](https://stackoverflow.com/q/1491001), so be careful), use [`git lfs migrate`](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-migrate.adoc):

      git fetch --all
      git lfs migrate import --everything --above=25MiB
      git push --all --force-with-lease

# Quirks

### Disable Git LFS file locking

Git LFS S3 Proxy does not support the [Git LFS File Locking API](https://github.com/git-lfs/git-lfs/blob/main/docs/api/locking.md), which would require additional infrastructure. Without this configuration, Git will show a persistent warning on every push/pull ([#6](https://github.com/twilligon/git-lfs-s3-proxy/issues/6)). To disable the warning:

    git config lfs.<YOUR_LFS_URL>.locksverify false

Or to disable it globally for all LFS servers:

    git config --global lfs.locksverify false

### No multipart upload support

Git LFS S3 Proxy does not currently support [multipart uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) for large files. Files that exceed S3's single-part upload limit (typically 5 GB, but some providers use lower limits) will fail with HTTP 413 errors ([#7](https://github.com/twilligon/git-lfs-s3-proxy/issues/7)).

Some S3-compatible providers may enforce even lower limits for single-part uploads. If you encounter 413 errors when uploading large files, you may need to:

- Use a different storage provider with higher single-part upload limits
- Split large files into smaller chunks before adding them to LFS
- Use a different LFS server implementation that supports multipart uploads

This limitation also means Git LFS S3 Proxy cannot handle the full range of file sizes that Git LFS was designed to support.

### GitLab: Disable built-in LFS

GitLab "helpfully" rejects commits containing "missing" LFS objects. After configuring a non-GitLab LFS server, GitLab will consider all new LFS objects "missing" and reject new commits:

    remote: GitLab: LFS objects are missing. Ensure LFS is properly set up or try a manual "git lfs push --all".
    To gitlab.com:twilligon/lfs-test
     ! [remote rejected] main -> main (pre-receive hook declined)
    error: failed to push some refs to 'gitlab.com:twilligon/lfs-test'

To disable this "feature", disable LFS on the GitLab repository. This can be done via the repository's GitLab page with **Settings** > **General** > **Visibility, project features, permissions** (click **Expand**) > **Repository** > **Git Large File Storage (LFS)** (disable, then click **Save changes**), or via the API:

    curl --request PUT --header "PRIVATE-TOKEN: <your-token>" \
     --url "https://gitlab.com/api/v4/projects/<your-project-ID>" \
     --data "lfs_enabled=false"

### DigitalOcean/Linode: `service=s3` parameter

The `aws4fetch` library we use currently incorrectly guesses the `service` parameter for [DigitalOcean Spaces](https://github.com/mhart/aws4fetch/issues/15) or [Linode Object Storage](https://github.com/twilligon/git-lfs-s3-proxy/issues/10), which causes signatures to be computed with the wrong value for that parameter, which causes signature verification to fail, which causes authentication to fail, which causes `git-lfs-s3-proxy` to [fail](https://github.com/twilligon/git-lfs-s3-proxy/issues/10) as if your credentials are incorrect.

Hopefully `aws4fetch` merges the [fix](https://github.com/mhart/aws4fetch/pull/79) and this becomes unnecessary. Until then, if you encounter this issue, explicitly set `service=s3` to the path in your instance URL after the hostname but before the endpoint:

    https://<ACCESS_KEY_ID>:<SECRET_ACCESS_KEY>@<INSTANCE>/service=s3/<ENDPOINT>/<BUCKET>

For example, with a Linode bucket `my-repo` in `us-east-1` region with access key ID `foo` and secret access key `bar` via the default instance:

    https://foo:bar@git-lfs-s3-proxy.pages.dev/service=s3/us-east-1.linodeobjects.com/my-repo

