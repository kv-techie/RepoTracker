import git
import sys
repo_path = r'C:\Users\vinod\OneDrive\Desktop\Ink In Quills\Marvel-Clue-Hunt'
repo = git.Repo(repo_path)
diffs = repo.index.diff(None)
untracked = repo.untracked_files
print('Diffs:', len(diffs))
print('Untracked:', len(untracked))
