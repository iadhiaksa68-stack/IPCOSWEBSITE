const REPOSITORY = 'iadhiaksa68-stack/IPCOSWEBSITE';
const WORKFLOW = '.github/workflows/release-checks.yml';
function releaseDecision(runs, sha) {
    const run = runs.find(item => item.head_sha === sha && item.path === WORKFLOW && item.head_repository?.full_name === REPOSITORY);
    if (!run || run.status !== 'completed') return {state:'waiting'};
    return run.conclusion === 'success' ? {state:'passed',url:run.html_url} : {state:'failed',reason:run.conclusion || 'unknown'};
}
async function verifyCommit(sha, {fetchRuns, pause, attempts=48} = {}) {
    if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('A full Git commit SHA is required. Deploy through the connected Git repository.');
    for (let attempt=0; attempt<attempts; attempt++) {
        const decision = releaseDecision(await fetchRuns(sha), sha);
        if (decision.state === 'passed') return decision;
        if (decision.state === 'failed') throw new Error(`Required role tests failed: ${decision.reason}`);
        if (attempt===0) console.log(`Waiting for required role tests on commit ${sha.slice(0,7)}.`);
        if (attempt+1<attempts) await pause();
    }
    throw new Error('Required tests have not passed for this commit. Publication blocked.');
}
module.exports = {releaseDecision,verifyCommit};
if (require.main === module) {
    verifyCommit(process.env.VERCEL_GIT_COMMIT_SHA, {
        fetchRuns: async sha => {
            const url = `https://api.github.com/repos/${REPOSITORY}/actions/workflows/release-checks.yml/runs?head_sha=${sha}&per_page=10`;
            const response = await fetch(url,{headers:{Accept:'application/vnd.github+json','User-Agent':'IPCOS-release-gate'},signal:AbortSignal.timeout(15000)});
            if (!response.ok) throw new Error(`Cannot verify required tests (GitHub ${response.status}). Publication blocked.`);
            const body = await response.json();
            if (!Array.isArray(body.workflow_runs)) throw new Error('Invalid CI response. Publication blocked.');
            return body.workflow_runs;
        },
        pause: () => new Promise(resolve=>setTimeout(resolve,10000))
    }).then(result=>console.log(`PASS Required role tests verified for this exact commit: ${result.url}`))
      .catch(error=>{console.error(error.message);process.exitCode=1;});
}
