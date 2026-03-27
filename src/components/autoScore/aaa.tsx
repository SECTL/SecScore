import React, { useState, useCallback } from "react";

// >>> 
import type { JsonGroup, Config, ImmutableTree, BuilderProps } from '@react-awesome-query-builder/antd';
import { Utils as QbUtils, Query, Builder, AntdConfig } from '@react-awesome-query-builder/antd';
const InitialConfig = AntdConfig;
// <<<

// You need to provide your own config. See below 'Config format'
const config: Config = {
  ...InitialConfig,
  fields: {
    ...InitialConfig.fields,
    qty: {
      type: 'number',
      label: 'Quantity',
      fieldSettings: {
        min: 0,
        max: 100,
      }
    },
    // complex
    user: {
      type: '!struct', // special keyword for complex fields
      label: 'User',
      subfields: {
        // subfields of complex field
        name: {
          type: 'text',
          label: 'Name',
          label2: 'User name', //optional, see below
          fieldSettings: {
            validateValue: (val: string, _fieldSettings: any) => (val.length <= 20),
          }
        },
      },
    },
  },
}

// You can load query value from your backend storage (for saving see `Query.onChange()`)
const queryValue: JsonGroup = { id: QbUtils.uuid(), type: "group" };

const DemoQueryBuilder: React.FC = () => {
  const [state, setState] = useState({
    tree: QbUtils.loadTree(queryValue),
    config: config
  });

  const onChange = useCallback((immutableTree: ImmutableTree, config: Config) => {
    // Tip: for better performance you can apply `throttle` - see `packages/examples/src/demo`
    setState(prevState => ({ ...prevState, tree: immutableTree, config: config }));

    const jsonTree = QbUtils.getTree(immutableTree);
    console.log(jsonTree);
    // `jsonTree` can be saved to backend, and later loaded to `queryValue`
  }, []);

  const renderBuilder = useCallback((props: BuilderProps) => (
    <div className="query-builder-container" style={{ padding: "10px" }}>
      <div className="query-builder qb-lite">
        <Builder {...props} />
      </div>
    </div>
  ), []);

  return (
    <div>
      <Query
        {...config}
        value={state.tree}
        onChange={onChange}
        renderBuilder={renderBuilder}
      />
      <div className="query-builder-result">
        <div>
          Query string:{" "}
          <pre>
            {JSON.stringify(QbUtils.queryString(state.tree, state.config))}
          </pre>
        </div>
        <div>
          MongoDb query:{" "}
          <pre>
            {JSON.stringify(QbUtils.mongodbFormat(state.tree, state.config))}
          </pre>
        </div>
        <div>
          SQL where:{" "}
          <pre>
            {JSON.stringify(QbUtils.sqlFormat(state.tree, state.config))}
          </pre>
        </div>
        <div>
          JsonLogic:{" "}
          <pre>
            {JSON.stringify(QbUtils.jsonLogicFormat(state.tree, state.config))}
          </pre>
        </div>
      </div>
    </div>
  );
};
export default DemoQueryBuilder;