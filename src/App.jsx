import { useState } from "react";
import set from "lodash/set";
import get from "lodash/get";
import sample from "lodash/sample";
import uniq from "lodash/uniq";
import uniqBy from "lodash/uniqBy";
import isPlainObject from "lodash/isPlainObject";
import {
  RefreshCw,
  Link,
  CheckSquare,
  Square,
  Tag,
  Hash,
  Download,
} from "lucide-react";

import {
  Container,
  Row,
  Col,
  Form,
  Button,
  Table,
  Card,
  InputGroup,
} from "react-bootstrap";

function App() {
  // 状態管理
  const [jsonInput, setJsonInput] = useState("");
  const [config, setConfig] = useState([]);
  const [sourceList, setSourceList] = useState([]);
  const [generatedData, setGeneratedData] = useState(null);
  const [generateCount, setGenerateCount] = useState(10);

  // パス内の [] を [index] に変換する
  const fixPath = (p, index = 0) => p.replace(/\[\]/g, `[${index}]`);

  // 解析・グループ化ロジック
  const analyzeJson = () => {
    if (!jsonInput.trim()) return alert("JSONを入力してください");
    try {
      const parsed = JSON.parse(jsonInput);
      const list = Array.isArray(parsed)
        ? parsed
        : parsed.rowsData ||
          Object.values(parsed).find(Array.isArray) || [parsed];
      setSourceList(list);

      const paths = [];
      const extract = (obj, prefix = "") => {
        Object.keys(obj).forEach((key) => {
          const val = obj[key];
          const path = prefix ? `${prefix}.${key}` : key;

          if (Array.isArray(val)) {
            paths.push({
              path: `${path}[]`,
              type: "arrayCount",
              min: 1,
              max: Math.max(1, val.length),
              isArrayRoot: true,
            });
            if (val.length > 0) {
              if (isPlainObject(val[0])) {
                extract(val[0], `${path}[]`);
              } else {
                const valPool = uniq(
                  list.flatMap((item) => {
                    const arr = get(item, path);
                    return Array.isArray(arr) ? arr : [];
                  }),
                ).filter((v) => v !== undefined);
                paths.push({
                  path: `${path}[]_val`,
                  displayName: `${path}[]`,
                  type: "existing",
                  pool: valPool,
                  groupId: null,
                  groupColor: null,
                  selected: false,
                });
              }
            }
          } else if (isPlainObject(val)) {
            extract(val, path);
          } else {
            const valPool = uniq(
              list.flatMap((item) => {
                const v = get(item, fixPath(path, 0));
                return v !== undefined ? [v] : [];
              }),
            ).filter((v) => v !== undefined);
            paths.push({
              path,
              displayName: path,
              type: "existing",
              pool: valPool,
              prefix: "row-",
              startNo: 0,
              fixedValue: val,
              groupId: null,
              groupColor: null,
              selected: false,
            });
          }
        });
      };
      extract(list[0]);
      setConfig(paths);
      setGeneratedData(null);
    } catch (e) {
      alert("JSON解析エラー: " + e.message);
    }
  };

  // 項目の紐づけ
  const createGroup = () => {
    const selectedIndices = config
      .map((c, i) => (c.selected ? i : -1))
      .filter((i) => i !== -1);
    if (selectedIndices.length < 2)
      return alert("紐付けたい項目を2つ以上選択してください");
    const groupId = `group_${Date.now()}`;
    const colors = ["indigo", "emerald", "amber", "rose", "cyan"];
    const color =
      colors[
        uniq(config.map((c) => c.groupId).filter(Boolean)).length %
          colors.length
      ];
    const selectedPaths = selectedIndices.map((i) => config[i].path);
    const combinationPool = uniqBy(
      sourceList.flatMap((row) => {
        const isArrayInvolved = selectedPaths.some((p) => p.includes("[]"));
        if (!isArrayInvolved) {
          const combo = {};
          selectedPaths.forEach((p) => set(combo, p, get(row, p)));
          return [combo];
        }
        const rootPath = selectedPaths
          .find((p) => p.includes("[]"))
          .split("[]")[0];
        const arrayData = get(row, rootPath) || [];
        return arrayData.map((_, idx) => {
          const combo = {};
          selectedPaths.forEach((p) => {
            const actualPath = p.endsWith("_val")
              ? p.replace("[]_val", `[${idx}]`)
              : p.replace("[]", `[${idx}]`);
            set(combo, p, get(row, actualPath));
          });
          return combo;
        });
      }),
      (item) => JSON.stringify(item),
    );
    setConfig(
      config.map((cfg, i) =>
        selectedIndices.includes(i)
          ? {
              ...cfg,
              groupId,
              groupColor: color,
              groupPool: combinationPool,
              selected: false,
              type: "existing",
            }
          : cfg,
      ),
    );
  };

  // 生成・編集ロジック
  const forgeData = () => {
    const newData = Array.from({ length: generateCount }).map((_, rowIndex) => {
      const item = {};
      const arrayCounts = {};
      const snapshots = {};
      config
        .filter((c) => c.isArrayRoot)
        .forEach((c) => {
          arrayCounts[c.path] =
            Math.floor(Math.random() * (c.max - c.min + 1)) + c.min;
        });
      config
        .filter((c) => !c.isArrayRoot)
        .forEach((cfg) => {
          const isArrayPath = cfg.path.includes("[]");
          const arrayRoot = isArrayPath
            ? cfg.path.split("[]")[0] + "[]"
            : "root";
          const count = isArrayPath ? arrayCounts[arrayRoot] || 1 : 1;
          for (let j = 0; j < count; j++) {
            let val;
            if (cfg.groupId) {
              const snapKey = `${cfg.groupId}_${arrayRoot}_${j}`;
              if (!snapshots[snapKey])
                snapshots[snapKey] = sample(cfg.groupPool);
              val = get(snapshots[snapKey], cfg.path);
            } else {
              if (cfg.type === "existing") val = sample(cfg.pool);
              else if (cfg.type === "increment") {
                // 指定された開始番号から加算
                val = `${cfg.prefix || ""}${Number(cfg.startNo) + rowIndex}`;
              } else val = cfg.fixedValue;
            }
            const finalPath = cfg.path.endsWith("_val")
              ? cfg.path.replace("[]_val", `[${j}]`)
              : fixPath(cfg.path, j);
            set(item, finalPath, val);
          }
        });
      return item;
    });
    setGeneratedData(newData);
  };

  const updateCell = (rowIndex, path, value) => {
    const updated = [...generatedData];
    const finalPath = path.endsWith("_val")
      ? path.replace("[]_val", "[0]")
      : fixPath(path, 0);
    set(updated[rowIndex], finalPath, value);
    setGeneratedData(updated);
  };

  return (
    <Container fluid className="py-4 bg-light min-vh-100">
      <header className="mb-4">
        <h1 className="display-6 fw-bold text-primary">JSON作成ツール</h1>
      </header>

      <Row className="g-4">
        {/* 左側：操作パネル */}
        <Col lg={4} xl={3}>
          <Card className="shadow-sm mb-4">
            <Card.Body>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-bold">JSON入力欄</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={8}
                  className="font-monospace small"
                  style={{ backgroundColor: "#f8f9fa" }}
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder="ここにJSONをペースト..."
                />
              </Form.Group>
              <Button
                variant="dark"
                className="w-100 d-flex align-items-center justify-content-center gap-2"
                onClick={analyzeJson}
              >
                <RefreshCw size={16} /> JSON解析実行
              </Button>
            </Card.Body>
          </Card>

          {config.length > 0 && (
            <Card className="shadow-sm border-primary">
              <Card.Body>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold text-primary">
                    生成行数
                  </Form.Label>
                  <Form.Control
                    type="number"
                    value={generateCount}
                    onChange={(e) => setGenerateCount(Number(e.target.value))}
                    className="text-center fw-bold"
                  />
                </Form.Group>
                <div className="d-flex gap-2 mb-3">
                  <Button
                    variant="outline-primary"
                    size="sm"
                    className="flex-grow-1"
                    onClick={createGroup}
                  >
                    <Link size={14} className="me-1" /> 紐付け
                  </Button>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="flex-grow-1"
                    onClick={() =>
                      setConfig(
                        config.map((c) => ({
                          ...c,
                          groupId: null,
                          groupColor: null,
                          selected: false,
                        })),
                      )
                    }
                  >
                    解除
                  </Button>
                </div>
                <Button
                  variant="primary"
                  className="w-100 fw-bold py-2"
                  onClick={forgeData}
                >
                  JSON生成
                </Button>
              </Card.Body>
            </Card>
          )}
        </Col>

        {/* 右側：設定・プレビュー */}
        <Col lg={8} xl={9}>
          {config.length > 0 && (
            <Card className="shadow-sm mb-4">
              <Card.Header className="bg-white fw-bold small">
                構造設定
              </Card.Header>
              <div className="table-responsive">
                <Table hover className="align-middle mb-0 small">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: "50px" }}></th>
                      <th>項目名</th>
                      <th>生成ルール / 個数設定</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.map((cfg, idx) => (
                      <tr
                        key={cfg.path}
                        className={cfg.isArrayRoot ? "table-light fw-bold" : ""}
                      >
                        <td className="text-center">
                          {!cfg.isArrayRoot && (
                            <div
                              className="cursor-pointer text-primary"
                              onClick={() =>
                                setConfig(
                                  config.map((c, i) =>
                                    i === idx
                                      ? { ...c, selected: !c.selected }
                                      : c,
                                  ),
                                )
                              }
                            >
                              {cfg.selected ? (
                                <CheckSquare size={18} />
                              ) : (
                                <Square size={18} className="text-muted" />
                              )}
                            </div>
                          )}
                          {cfg.isArrayRoot && (
                            <Hash size={16} className="text-muted" />
                          )}
                        </td>
                        <td className="font-monospace">
                          {cfg.displayName || cfg.path}
                          {cfg.groupId && (
                            <Tag size={12} className="ms-2 text-primary" />
                          )}
                        </td>
                        <td>
                          {cfg.isArrayRoot ? (
                            <InputGroup size="sm" style={{ width: "180px" }}>
                              <Form.Control
                                type="number"
                                value={cfg.min}
                                onChange={(e) =>
                                  setConfig(
                                    config.map((c, i) =>
                                      i === idx
                                        ? { ...c, min: Number(e.target.value) }
                                        : c,
                                    ),
                                  )
                                }
                              />
                              <InputGroup.Text>~</InputGroup.Text>
                              <Form.Control
                                type="number"
                                value={cfg.max}
                                onChange={(e) =>
                                  setConfig(
                                    config.map((c, i) =>
                                      i === idx
                                        ? { ...c, max: Number(e.target.value) }
                                        : c,
                                    ),
                                  )
                                }
                              />
                              <InputGroup.Text>Items</InputGroup.Text>
                            </InputGroup>
                          ) : !cfg.groupId ? (
                            <div className="d-flex gap-2 align-items-center">
                              <Form.Select
                                size="sm"
                                style={{ width: "110px" }}
                                value={cfg.type}
                                onChange={(e) =>
                                  setConfig(
                                    config.map((c, i) =>
                                      i === idx
                                        ? { ...c, type: e.target.value }
                                        : c,
                                    ),
                                  )
                                }
                              >
                                <option value="existing">既存値</option>
                                <option value="increment">連番</option>
                                <option value="fixed">固定</option>
                              </Form.Select>
                              {cfg.type === "increment" && (
                                <>
                                  <Form.Control
                                    size="sm"
                                    type="text"
                                    placeholder="Prefix"
                                    value={cfg.prefix}
                                    onChange={(e) =>
                                      setConfig(
                                        config.map((c, i) =>
                                          i === idx
                                            ? { ...c, prefix: e.target.value }
                                            : c,
                                        ),
                                      )
                                    }
                                    style={{ width: "70px" }}
                                    title="接頭辞"
                                  />
                                  <Form.Control
                                    size="sm"
                                    type="number"
                                    placeholder="Start"
                                    value={cfg.startNo}
                                    onChange={(e) =>
                                      setConfig(
                                        config.map((c, i) =>
                                          i === idx
                                            ? { ...c, startNo: e.target.value }
                                            : c,
                                        ),
                                      )
                                    }
                                    style={{ width: "70px" }}
                                    title="開始番号"
                                  />
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                              Linked
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          )}

          {generatedData && (
            <Card className="shadow-lg border-dark overflow-hidden">
              <Card.Header className="bg-dark text-white d-flex justify-content-between align-items-center py-2">
                <span className="small fw-bold uppercase">Editor Preview</span>
                <Button
                  variant="success"
                  size="sm"
                  className="fw-bold d-flex align-items-center gap-1"
                  onClick={() => {
                    const blob = new Blob(
                      [JSON.stringify(generatedData, null, 2)],
                      { type: "application/json" },
                    );
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = "forge_data.json";
                    a.click();
                  }}
                >
                  <Download size={14} /> DOWNLOAD
                </Button>
              </Card.Header>
              <div className="table-responsive" style={{ maxHeight: "500px" }}>
                <Table
                  bordered
                  hover
                  size="sm"
                  className="mb-0 small text-nowrap"
                >
                  <thead className="table-light sticky-top">
                    <tr>
                      {config
                        .filter(
                          (cfg) => !cfg.isArrayRoot && !cfg.path.endsWith("[]"),
                        )
                        .map((cfg) => (
                          <th key={cfg.path} className="px-2">
                            {cfg.displayName || cfg.path}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {generatedData.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {config
                          .filter(
                            (cfg) =>
                              !cfg.isArrayRoot && !cfg.path.endsWith("[]"),
                          )
                          .map((cfg) => {
                            const val = get(
                              row,
                              cfg.path.endsWith("_val")
                                ? cfg.path.replace("[]_val", "[0]")
                                : fixPath(cfg.path, 0),
                            );
                            return (
                              <td key={cfg.path} className="p-0">
                                <Form.Select
                                  size="sm"
                                  className="border-0 bg-transparent py-1 shadow-none"
                                  value={val}
                                  onChange={(e) =>
                                    updateCell(rIdx, cfg.path, e.target.value)
                                  }
                                >
                                  <option value={val}>{String(val)}</option>
                                  {cfg.pool &&
                                    cfg.pool
                                      .filter((v) => v !== val)
                                      .map((pVal) => (
                                        <option key={pVal} value={pVal}>
                                          {String(pVal)}
                                        </option>
                                      ))}
                                </Form.Select>
                              </td>
                            );
                          })}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          )}
        </Col>
      </Row>
    </Container>
  );
}

export default App;
