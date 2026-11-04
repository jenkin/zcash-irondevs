"""Dynamic co-authorship network of the Zcash ecosystem.

Pipeline stages:
    mine      -> extract commit metadata from bare repositories (PyDriller)
    identity  -> deduplicate authors across name/email aliases
    graph     -> build the temporal author co-authorship network + metrics
    export    -> emit graph.json consumed by the web visualization
"""

__version__ = "0.1.0"
