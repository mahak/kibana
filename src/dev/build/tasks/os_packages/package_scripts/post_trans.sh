export KBN_PATH_CONF=${KBN_PATH_CONF:-<%= configDir %>}

if [ ! -f "${KBN_PATH_CONF}"/kibana.keystore ]; then
    /usr/share/kibana/bin/kibana-keystore create
    chown root:<%= group %> "${KBN_PATH_CONF}"/kibana.keystore
    chmod 660 "${KBN_PATH_CONF}"/kibana.keystore
fi
