#include <algorithm>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

using namespace std;

static const int INF = 1e9;

int solve_bounded(const vector<int>& value, const vector<int>& count, int target) {
    vector<int> dp(target + 1, INF);
    dp[0] = 0;

    for (size_t i = 0; i < value.size(); ++i) {
        vector<int> ndp = dp;
        for (int amount = 0; amount <= target; ++amount) {
            if (dp[amount] == INF) {
                continue;
            }
            for (int k = 1; k <= count[i] && amount + k * value[i] <= target; ++k) {
                ndp[amount + k * value[i]] = min(ndp[amount + k * value[i]], dp[amount] + k);
            }
        }
        dp.swap(ndp);
    }

    return dp[target] == INF ? -1 : dp[target];
}

int solve_unbounded(const vector<int>& value, int target) {
    vector<int> dp(target + 1, INF);
    dp[0] = 0;

    for (int amount = 1; amount <= target; ++amount) {
        for (int coin : value) {
            if (coin <= amount && dp[amount - coin] != INF) {
                dp[amount] = min(dp[amount], dp[amount - coin] + 1);
            }
        }
    }

    return dp[target] == INF ? -1 : dp[target];
}

int main(int argc, char* argv[]) {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    ifstream fin("input.txt");
    ofstream fout("output.txt");
    if (!fin.is_open() || !fout.is_open()) {
        return 1;
    }

    int n;
    fin >> n;
    vector<int> value(n), count(n);
    for (int i = 0; i < n; ++i) {
        fin >> value[i] >> count[i];
    }
    int target;
    fin >> target;

    bool unbounded = argc > 1 && string(argv[1]) == "--unbounded";
    int answer = unbounded ? solve_unbounded(value, target) : solve_bounded(value, count, target);
    fout << answer << '\n';
    return 0;
}
